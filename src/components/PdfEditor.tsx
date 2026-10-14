"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  Upload,
  Type,
  Save,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Rnd } from "react-rnd";
import { pdfjsLib } from "@/lib/pdfjs";
import { DEFAULT_TEXT_FORMAT, LINE_HEIGHT, MIN_TEXT_WIDTH, textCss, type TextFormat } from "@/lib/editorFonts";
import { exportAnnotatedPdf, formatOf, textBoxWidth, type Annotation } from "@/lib/annotations";
import { useUndoable } from "@/lib/useUndoable";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import TextToolbar from "@/components/TextToolbar";
import PdfPageCanvas from "@/components/PdfPageCanvas";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const DEFAULT_MAX_SCALE = 1.5;
// Space reserved above the pages for the floating toolbar (matches pt-36) and side padding (px-4)
const SCROLL_PADDING_TOP = 144;
const SCROLL_PADDING_X = 16;
const DUPLICATE_OFFSET = 12;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type PageSize = { width: number; height: number }; // unscaled PDF points

function TextBox({
  ann,
  scale,
  isEditing,
  onChange,
  onFinish,
  onShortcut,
}: {
  ann: Annotation;
  scale: number;
  isEditing: boolean;
  onChange: (content: string) => void;
  onFinish: () => void;
  onShortcut: (e: React.KeyboardEvent) => void;
}) {
  const style = textCss(formatOf(ann), scale, ann.width !== undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });

  useEffect(() => {
    const el = textareaRef.current;
    if (!isEditing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div className="w-full select-none" style={style}>
        {ann.content || " "}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={ann.content}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onFinish}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
        onShortcut(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder="Type here"
      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-slate-400"
      style={style}
    />
  );
}

function ToolbarButton({
  label,
  title,
  onClick,
  disabled,
  active,
  className,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "group flex w-[4.5rem] flex-col items-center justify-center gap-2 rounded-xl p-2 transition-all disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-blue-50 text-blue-600 ring-2 ring-blue-500/30 dark:bg-blue-900/30 dark:text-blue-300"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        className
      )}
    >
      {children}
      <span className="whitespace-nowrap text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

const ToolbarDivider = () => <div className="mx-1 h-10 w-px bg-slate-200 dark:bg-slate-700/50" />;

export default function PdfEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const {
    value: annotations,
    set: setAnnotations,
    checkpoint,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetAnnotations,
    canUndo,
    canRedo,
  } = useUndoable<Annotation[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isPlacingText, setIsPlacingText] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, setFontsVersion] = useState(0);
  const lastFormatRef = useRef<TextFormat>(DEFAULT_TEXT_FORMAT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Content point to keep under the same screen position across a zoom change
  const zoomAnchorRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number; from: number } | null>(
    null
  );
  // The click that ends a drag/resize may land on the page; it must not deselect or place text.
  const suppressPageClickRef = useRef(false);
  const suppressNextPageClick = () => {
    suppressPageClickRef.current = true;
    setTimeout(() => (suppressPageClickRef.current = false), 0);
  };

  const fitWidthScale = useCallback(
    (sizes: PageSize[]) => {
      const el = scrollRef.current;
      const widest = Math.max(...sizes.map((s) => s.width));
      if (!el || !widest) return 1;
      return clampZoom((el.clientWidth - SCROLL_PADDING_X * 2) / widest);
    },
    []
  );

  // Load PDF and every page's size up front, so the full document can be laid out before rendering
  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      setPageSizes([]);
      return;
    }

    let cancelled = false;
    const loadPdf = async () => {
      const pdf = await pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      const sizes = await Promise.all(
        Array.from({ length: pdf.numPages }, async (_, i) => {
          const { width, height } = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
          return { width, height };
        })
      );
      if (cancelled) return;
      setPdfDoc(pdf);
      setPageSizes(sizes);
      setCurrentPage(1);
      setScale(Math.min(DEFAULT_MAX_SCALE, fitWidthScale(sizes)));
    };

    loadPdf().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [pdfFile, fitWidthScale]);

  // ---- Zoom ----

  const zoomTo = useCallback(
    (next: number, anchor?: { clientX: number; clientY: number }) => {
      const el = scrollRef.current;
      const target = clampZoom(next);
      if (!el || target === scale) return;
      const rect = el.getBoundingClientRect();
      const offsetX = anchor ? anchor.clientX - rect.left : el.clientWidth / 2;
      const offsetY = anchor ? anchor.clientY - rect.top : el.clientHeight / 2;
      zoomAnchorRef.current = {
        x: el.scrollLeft + offsetX,
        y: el.scrollTop + offsetY,
        offsetX,
        offsetY,
        from: scale,
      };
      setScale(target);
    },
    [scale]
  );

  const zoomIn = useCallback(() => zoomTo(ZOOM_STEPS.find((z) => z > scale + 0.01) ?? MAX_ZOOM), [scale, zoomTo]);
  const zoomOut = useCallback(
    () => zoomTo([...ZOOM_STEPS].reverse().find((z) => z < scale - 0.01) ?? MIN_ZOOM),
    [scale, zoomTo]
  );
  const zoomToFit = useCallback(() => zoomTo(fitWidthScale(pageSizes)), [fitWidthScale, pageSizes, zoomTo]);

  // Keep the anchored point under the cursor (or viewport centre) after the layout grows/shrinks
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchorRef.current;
    if (!el) return;
    if (!anchor) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      return;
    }
    zoomAnchorRef.current = null;
    const ratio = scale / anchor.from;
    el.scrollLeft = (anchor.x - SCROLL_PADDING_X) * ratio + SCROLL_PADDING_X - anchor.offsetX;
    el.scrollTop = (anchor.y - SCROLL_PADDING_TOP) * ratio + SCROLL_PADDING_TOP - anchor.offsetY;
  }, [scale]);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms around the cursor instead of zooming the browser
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomTo(scale * Math.exp(-e.deltaY * 0.0025), { clientX: e.clientX, clientY: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale, zoomTo, pdfDoc]);

  // ---- Pages ----

  const updateCurrentPage = () => {
    const el = scrollRef.current;
    if (!el) return;
    const probe = el.getBoundingClientRect().top + el.clientHeight * 0.4;
    let page = 1;
    pageRefs.current.forEach((pageEl, i) => {
      if (pageEl && pageEl.getBoundingClientRect().top <= probe) page = i + 1;
    });
    setCurrentPage(page);
  };

  const goToPage = (page: number) => {
    const target = Math.min(pageSizes.length, Math.max(1, page));
    pageRefs.current[target - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(target);
  };

  // ---- Annotations ----

  const handleFile = (file: File | undefined) => {
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      resetAnnotations([]);
    }
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  const handleClear = () => {
    setPdfFile(null);
    setPdfDoc(null);
    resetAnnotations([]);
    setIsPlacingText(false);
    setSelectedId(null);
    setEditingId(null);
  };

  // Clicking empty page space either drops a new text box (in Add Text mode) or clears the selection.
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (suppressPageClickRef.current) return;
    if (!isPlacingText) {
      setSelectedId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const id = crypto.randomUUID();
    // New boxes reuse the last format the user picked, like other editors
    const format = lastFormatRef.current;
    const newText: Annotation = {
      id,
      type: "text",
      page,
      // Centre the first line on the cursor
      x: (e.clientX - rect.left) / scale,
      y: Math.max(0, (e.clientY - rect.top) / scale - (format.fontSize * LINE_HEIGHT) / 2),
      content: "",
      format,
    };

    checkpoint();
    setAnnotations((prev) => [...prev, newText]);
    setSelectedId(id);
    setEditingId(id);
    setIsPlacingText(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const page = currentPage;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const height = 40;
        const width = height * (img.width / img.height);
        const pageSize = pageSizes[page - 1];
        // Drop it in the middle of the visible part of the current page
        const pageEl = pageRefs.current[page - 1];
        const el = scrollRef.current;
        let y = 40;
        if (pageEl && el) {
          const viewportMid = el.getBoundingClientRect().top + el.clientHeight / 2;
          y = (viewportMid - pageEl.getBoundingClientRect().top) / scale - height / 2;
        }
        const newImage: Annotation = {
          id: crypto.randomUUID(),
          type: "image",
          page,
          x: Math.max(0, (pageSize.width - width) / 2),
          y: Math.min(Math.max(0, y), pageSize.height - height),
          content: dataUrl,
          width,
          height,
        };
        checkpoint();
        setAnnotations((prev) => [...prev, newImage]);
        setSelectedId(newImage.id);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann)));
  };

  const updateFormat = useCallback(
    (id: string, updates: Partial<TextFormat>) => {
      checkpoint();
      setAnnotations((prev) =>
        prev.map((ann) => {
          if (ann.id !== id) return ann;
          const format = { ...formatOf(ann), ...updates };
          lastFormatRef.current = format;
          return { ...ann, format };
        })
      );
    },
    [checkpoint, setAnnotations]
  );

  const toggleFormatShortcut = useCallback(
    (e: { key: string; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }, id: string) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const ann = annotations.find((a) => a.id === id);
      if (ann?.type !== "text") return;
      const key = e.key.toLowerCase();
      if (key === "b" || key === "i") {
        e.preventDefault();
        const prop = key === "b" ? "bold" : "italic";
        updateFormat(id, { [prop]: !formatOf(ann)[prop] });
      }
    },
    [annotations, updateFormat]
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      checkpoint();
      setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
      setEditingId((edit) => (edit === id ? null : edit));
    },
    [checkpoint, setAnnotations]
  );

  const duplicateAnnotation = useCallback(
    (id: string) => {
      const ann = annotations.find((a) => a.id === id);
      if (!ann) return;
      const copy = { ...ann, id: crypto.randomUUID(), x: ann.x + DUPLICATE_OFFSET, y: ann.y + DUPLICATE_OFFSET };
      checkpoint();
      setAnnotations((prev) => [...prev, copy]);
      setSelectedId(copy.id);
    },
    [annotations, checkpoint, setAnnotations]
  );

  const nudgeAnnotation = useCallback(
    (id: string, dx: number, dy: number) => {
      setAnnotations((prev) =>
        prev.map((ann) => {
          if (ann.id !== id) return ann;
          const size = pageSizes[ann.page - 1];
          const width = ann.type === "text" ? textBoxWidth(ann) : ann.width || 0;
          return {
            ...ann,
            x: Math.min(Math.max(0, ann.x + dx), Math.max(0, size.width - width)),
            y: Math.min(Math.max(0, ann.y + dy), size.height - 1),
          };
        })
      );
    },
    [pageSizes, setAnnotations]
  );

  const startEditing = useCallback(
    (id: string) => {
      checkpoint();
      setEditingId(id);
    },
    [checkpoint]
  );

  // Leaving edit mode keeps the box selected, but an empty box is discarded.
  const finishEditing = (id: string) => {
    setEditingId((edit) => (edit === id ? null : edit));
    setAnnotations((prev) =>
      prev.filter((ann) => !(ann.id === id && ann.type === "text" && !ann.content.trim()))
    );
  };

  const undo = useCallback(() => {
    setEditingId(null);
    undoHistory();
  }, [undoHistory]);

  const redo = useCallback(() => {
    setEditingId(null);
    redoHistory();
  }, [redoHistory]);

  // Auto-width boxes are measured on a canvas, so re-measure once a font variant finishes loading
  useEffect(() => {
    const onLoaded = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", onLoaded);
    return () => document.fonts.removeEventListener("loadingdone", onLoaded);
  }, []);

  // Editor-wide shortcuts. Typing inside a field keeps its native behaviour (incl. textarea undo).
  useEffect(() => {
    if (!pdfDoc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod) {
        if (key === "z" && !e.shiftKey) undo();
        else if ((key === "z" && e.shiftKey) || key === "y") redo();
        else if (key === "=" || key === "+") zoomIn();
        else if (key === "-") zoomOut();
        else if (key === "0") zoomToFit();
        else if (key === "d" && selectedId) duplicateAnnotation(selectedId);
        else {
          if (selectedId) toggleFormatShortcut(e, selectedId);
          return;
        }
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        setIsPlacingText(false);
        setSelectedId(null);
        return;
      }
      if (!selectedId) return;

      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (e.key in arrows) {
        e.preventDefault();
        if (!e.repeat) checkpoint();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = arrows[e.key];
        nudgeAnnotation(selectedId, dx * step, dy * step);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteAnnotation(selectedId);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (annotations.find((a) => a.id === selectedId)?.type === "text") startEditing(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    pdfDoc,
    selectedId,
    annotations,
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomToFit,
    checkpoint,
    nudgeAnnotation,
    deleteAnnotation,
    duplicateAnnotation,
    startEditing,
    toggleFormatShortcut,
  ]);

  const downloadPdf = async () => {
    if (!pdfFile || annotations.length === 0) return;
    setIsExporting(true);

    try {
      const pdfBytes = await exportAnnotatedPdf(await pdfFile.arrayBuffer(), annotations);
      if (!pdfBytes) return;

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = pdfFile.name.replace(/\.[^/.]+$/, "");
      a.download = `edited_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Failed to export PDF", e);
      alert("Failed to export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!pdfFile) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-auto p-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Edit PDF</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
            Add text, images, or your signature to any PDF.
          </p>
          <PrivacyNote />
        </header>
        <label
          {...dropProps}
          className={cn(
            "flex h-64 w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80",
            isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
          )}
        >
          <Upload className="mb-4 h-12 w-12 text-slate-400" />
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Click or drag to upload a PDF
          </p>
          <p className="text-xs text-slate-500">Maximum file size 10MB</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>
    );
  }

  const renderAnnotation = (ann: Annotation, pageWidthPx: number) => {
    const isSelected = ann.id === selectedId;
    const isEditing = ann.id === editingId;
    const isText = ann.type === "text";
    const handle = (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 shadow" />
      </div>
    );

    return (
      <Rnd
        key={ann.id}
        position={{ x: ann.x * scale, y: ann.y * scale }}
        size={
          isText
            ? { width: textBoxWidth(ann) * scale, height: "auto" }
            : { width: (ann.width || 100) * scale, height: (ann.height || 50) * scale }
        }
        disableDragging={isEditing}
        enableResizing={
          !isSelected || isEditing
            ? false
            : isText
              ? { left: true, right: true }
              : { topLeft: true, topRight: true, bottomLeft: true, bottomRight: true }
        }
        lockAspectRatio={!isText}
        resizeHandleComponent={
          isText
            ? { left: handle, right: handle }
            : { topLeft: handle, topRight: handle, bottomLeft: handle, bottomRight: handle }
        }
        resizeHandleStyles={{
          left: { width: 20, left: -10 },
          right: { width: 20, right: -10 },
          topLeft: { width: 20, height: 20, top: -10, left: -10 },
          topRight: { width: 20, height: 20, top: -10, right: -10 },
          bottomLeft: { width: 20, height: 20, bottom: -10, left: -10 },
          bottomRight: { width: 20, height: 20, bottom: -10, right: -10 },
        }}
        onDragStart={() => setSelectedId(ann.id)}
        onDragStop={(e, d) => {
          suppressNextPageClick();
          if (d.x !== ann.x * scale || d.y !== ann.y * scale) {
            checkpoint();
            updateAnnotation(ann.id, { x: d.x / scale, y: d.y / scale });
          }
        }}
        onResizeStart={checkpoint}
        onResizeStop={suppressNextPageClick}
        onResize={(e, direction, ref, delta, position) => {
          updateAnnotation(ann.id, {
            x: position.x / scale,
            y: position.y / scale,
            width: Math.max(MIN_TEXT_WIDTH, ref.offsetWidth / scale),
            ...(isText ? {} : { height: ref.offsetHeight / scale }),
          });
        }}
        bounds="parent"
        className={cn(isSelected ? "z-20" : "z-10", isEditing ? "cursor-text" : "cursor-move")}
      >
        <div
          className={cn(
            "relative h-full w-full outline-offset-2",
            isSelected
              ? "outline outline-2 outline-blue-500"
              : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-400"
          )}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(ann.id);
          }}
          onDoubleClick={() => {
            if (isText && !isEditing) startEditing(ann.id);
          }}
          title={isText && !isEditing ? "Double-click to edit" : undefined}
        >
          {isSelected && (
            <div
              className={cn(
                "absolute z-30",
                // Flip below/left when the box is near the top/right edge of the page
                ann.y * scale < 52 ? "top-full mt-3" : "bottom-full mb-3",
                ann.x * scale > pageWidthPx / 2 ? "right-0" : "left-0"
              )}
            >
              <TextToolbar
                format={isText ? formatOf(ann) : undefined}
                onChange={(updates) => updateFormat(ann.id, updates)}
                onDelete={() => deleteAnnotation(ann.id)}
              />
            </div>
          )}

          {isText ? (
            <TextBox
              ann={ann}
              scale={scale}
              isEditing={isEditing}
              onChange={(content) => updateAnnotation(ann.id, { content })}
              onFinish={() => finishEditing(ann.id)}
              onShortcut={(e) => toggleFormatShortcut(e, ann.id)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ann.content}
              alt="Signature"
              className="pointer-events-none h-full w-full object-contain"
              draggable={false}
            />
          )}
        </div>
      </Rnd>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 relative overflow-hidden">
      {/* Floating Glassmorphism Toolbar */}
      <div className="absolute top-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-white/80 px-4 py-3 shadow-2xl backdrop-blur-xl border border-white/40 dark:bg-slate-900/80 dark:border-slate-700/50">
        <ToolbarButton label="Upload" title={`Active file: ${pdfFile.name}`} onClick={handleClear}>
          <Upload className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Add Text"
          title={isPlacingText ? "Click the PDF to place text (Esc to cancel)" : "Add Text"}
          active={isPlacingText}
          onClick={() => setIsPlacingText((placing) => !placing)}
        >
          <Type className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <label className="group flex w-[4.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-blue-500 p-2 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-600 hover:-translate-y-0.5">
          <PenTool className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wide">Sign</span>
          <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleImageUpload} />
        </label>

        <ToolbarDivider />

        <ToolbarButton label="Undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>
        <ToolbarButton label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label={isExporting ? "Saving..." : "Save"}
          title={annotations.length === 0 ? "Add text or a signature first" : "Download the edited PDF"}
          onClick={downloadPdf}
          disabled={isExporting || annotations.length === 0}
          className="hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
        >
          <Save className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>
      </div>

      {/* Editor Area: every page stacked vertically */}
      <div ref={scrollRef} data-scroll-root onScroll={updateCurrentPage} className="hide-scrollbar flex-1 overflow-auto pt-36 pb-20 px-4">
        <div className="flex min-h-full min-w-max flex-col items-center gap-6">
          {pdfDoc &&
            pageSizes.map((size, i) => {
              const page = i + 1;
              const widthPx = size.width * scale;
              return (
                <div
                  key={page}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                  onClick={(e) => handlePageClick(e, page)}
                  className={cn(
                    "relative shrink-0 bg-white shadow-xl",
                    isPlacingText && "cursor-crosshair ring-2 ring-blue-500/40"
                  )}
                  style={{ width: widthPx, height: size.height * scale, scrollMarginTop: SCROLL_PADDING_TOP - 8 }}
                >
                  <PdfPageCanvas pdfDoc={pdfDoc} pageNumber={page} scale={scale} />
                  {annotations.filter((a) => a.page === page).map((ann) => renderAnnotation(ann, widthPx))}
                </div>
              );
            })}
        </div>
      </div>

      {/* Floating zoom + pagination, bottom right */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-1 rounded-xl bg-white/90 p-1.5 shadow-lg backdrop-blur-md border border-slate-200/60 text-slate-600 dark:bg-slate-800/90 dark:border-slate-700/60 dark:text-slate-300">
        <button
          onClick={zoomOut}
          disabled={scale <= MIN_ZOOM}
          title="Zoom out (Ctrl+-)"
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={zoomToFit}
          title="Fit to width (Ctrl+0)"
          className="min-w-[3.5rem] rounded-lg px-1.5 py-1 text-center text-sm font-medium tabular-nums hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={scale >= MAX_ZOOM}
          title="Zoom in (Ctrl++)"
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ZoomIn className="h-5 w-5" />
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[5.5rem] px-2 text-center text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
          Page {currentPage} of {pageSizes.length}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= pageSizes.length}
          title="Next page"
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
