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
  Shapes,
  Eraser,
  Highlighter,
  Square,
  Circle,
  Slash,
  Check,
  X,
} from "lucide-react";
import { Rnd } from "react-rnd";
import { pdfjsLib } from "@/lib/pdfjs";
import { DEFAULT_TEXT_FORMAT, LINE_HEIGHT, MIN_TEXT_WIDTH, textCss, type TextFormat } from "@/lib/editorFonts";
import { exportAnnotatedPdf, formatOf, styleOf, textBoxWidth, type Annotation } from "@/lib/annotations";
import {
  SHAPE_DEFAULTS,
  SHAPE_DEFAULT_SIZE,
  isHighlight,
  isSymbol,
  type ShapeKind,
  type ShapeStyle,
} from "@/lib/shapes";
import { useUndoable } from "@/lib/useUndoable";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import TextToolbar from "@/components/TextToolbar";
import ShapeToolbar from "@/components/ShapeToolbar";
import { LineShape, ShapeBody, snapToAngle } from "@/components/ShapeView";
import PdfPageCanvas from "@/components/PdfPageCanvas";
import SignatureDialog from "@/components/SignatureDialog";
import { loadImage } from "@/lib/signature";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const DEFAULT_MAX_SCALE = 1.5;
// Space reserved above the pages for the floating toolbar (matches pt-36) and side padding (px-4)
const SCROLL_PADDING_TOP = 144;
const SCROLL_PADDING_X = 16;
const DUPLICATE_OFFSET = 12;
const SIGNATURE_HEIGHT = 40;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type PageSize = { width: number; height: number }; // unscaled PDF points

type Tool = "text" | ShapeKind | null;
// A shape being drawn by dragging on a page (PDF points)
type Draft = { page: number; kind: ShapeKind; x1: number; y1: number; x2: number; y2: number };

const SHAPE_TOOLS: { kind: ShapeKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "whiteout", label: "Whiteout", hint: "Cover content with a white box", icon: <Eraser className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "highlight", label: "Highlight", hint: "Mark text with a highlighter", icon: <Highlighter className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "rect", label: "Rectangle", hint: "Draw a box", icon: <Square className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "ellipse", label: "Ellipse", hint: "Draw a circle or ellipse", icon: <Circle className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "line", label: "Line", hint: "Draw a line (Shift snaps to 45°)", icon: <Slash className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "check", label: "Check", hint: "Place a check mark", icon: <Check className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "cross", label: "Cross", hint: "Place a cross mark", icon: <X className="h-5 w-5" strokeWidth={1.5} /> },
];
const MIN_DRAG_PX = 4;
const MIN_SHAPE_SIZE = 4;
const LINE_SNAP_TOLERANCE = 3; // PDF points

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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
  const [tool, setTool] = useState<Tool>(null);
  const isPlacingText = tool === "text";
  const activeShapeTool = SHAPE_TOOLS.find((t) => t.kind === tool);
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const lastShapeStyleRef = useRef<Partial<Record<ShapeKind, ShapeStyle>>>({});
  const [isSignOpen, setIsSignOpen] = useState(false);
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
    setTool(null);
    setSelectedId(null);
    setEditingId(null);
  };

  // Clicking empty page space either drops a new text box (in Add Text mode) or clears the selection.
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (suppressPageClickRef.current) return;
    if (tool && tool !== "text") return; // shapes are drawn with pointer events
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
    setTool(null);
  };

  // Adds an image (signature) in the middle of the visible part of the current page
  const addImageAnnotation = async (dataUrl: string) => {
    const img = await loadImage(dataUrl);
    const page = currentPage;
    const pageSize = pageSizes[page - 1];
    const height = SIGNATURE_HEIGHT;
    const width = Math.min(height * (img.width / img.height), pageSize.width * 0.8);
    const pageEl = pageRefs.current[page - 1];
    const el = scrollRef.current;
    let y = 40;
    if (pageEl && el) {
      const viewportMid = el.getBoundingClientRect().top + el.clientHeight / 2;
      y = (viewportMid - pageEl.getBoundingClientRect().top) / scale - height / 2;
    }
    let x = Math.max(0, (pageSize.width - width) / 2);
    y = Math.min(Math.max(0, y), pageSize.height - height);
    // Cascade instead of stacking exactly on top of a previous insert
    while (annotations.some((a) => a.page === page && a.type === "image" && Math.abs(a.y - y) < 1)) {
      x += DUPLICATE_OFFSET;
      y += DUPLICATE_OFFSET;
    }
    const newImage: Annotation = {
      id: crypto.randomUUID(),
      type: "image",
      page,
      x,
      y,
      content: dataUrl,
      width,
      height: width / (img.width / img.height),
    };
    checkpoint();
    setAnnotations((prev) => [...prev, newImage]);
    setSelectedId(newImage.id);
    setTool(null);
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
      const copy = {
        ...ann,
        id: crypto.randomUUID(),
        x: ann.x + DUPLICATE_OFFSET,
        y: ann.y + DUPLICATE_OFFSET,
        ...(ann.x2 !== undefined && ann.y2 !== undefined
          ? { x2: ann.x2 + DUPLICATE_OFFSET, y2: ann.y2 + DUPLICATE_OFFSET }
          : {}),
      };
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
          if (ann.x2 !== undefined && ann.y2 !== undefined) {
            // Lines move both ends, as far as the page allows
            const mx = clamp(dx, -Math.min(ann.x, ann.x2), size.width - Math.max(ann.x, ann.x2));
            const my = clamp(dy, -Math.min(ann.y, ann.y2), size.height - Math.max(ann.y, ann.y2));
            return { ...ann, x: ann.x + mx, y: ann.y + my, x2: ann.x2 + mx, y2: ann.y2 + my };
          }
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

  const updateStyle = (id: string, updates: Partial<ShapeStyle>) => {
    checkpoint();
    setAnnotations((prev) =>
      prev.map((ann) => {
        if (ann.id !== id || !ann.shape) return ann;
        const style = { ...styleOf(ann), ...updates };
        lastShapeStyleRef.current[ann.shape] = style;
        return { ...ann, style };
      })
    );
  };

  // ---- Drawing shapes ----

  const pointInPage = (e: React.PointerEvent<HTMLDivElement>, page: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = pageSizes[page - 1];
    return {
      x: clamp((e.clientX - rect.left) / scale, 0, size.width),
      y: clamp((e.clientY - rect.top) / scale, 0, size.height),
    };
  };

  // Turns a drag (or a plain click) into a shape annotation
  const shapeFromDraft = (d: Draft, id: string): Annotation => {
    const { kind } = d;
    const size = pageSizes[d.page - 1];
    const style = lastShapeStyleRef.current[kind] ?? SHAPE_DEFAULTS[kind];
    const base: Annotation = { id, type: "shape", page: d.page, shape: kind, style, content: "", x: 0, y: 0 };
    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const dragged = Math.hypot(dx, dy) * scale > MIN_DRAG_PX;

    if (kind === "line") {
      if (!dragged) {
        const half = SHAPE_DEFAULT_SIZE.line.width / 2;
        return { ...base, x: clamp(d.x1 - half, 0, size.width), y: d.y1, x2: clamp(d.x1 + half, 0, size.width), y2: d.y1 };
      }
      // Nearly level/upright lines are almost always meant to be exactly level/upright
      const x2 = Math.abs(dx) < LINE_SNAP_TOLERANCE ? d.x1 : d.x2;
      const y2 = Math.abs(dy) < LINE_SNAP_TOLERANCE ? d.y1 : d.y2;
      return { ...base, x: d.x1, y: d.y1, x2, y2 };
    }

    let { width, height } = SHAPE_DEFAULT_SIZE[kind];
    let x: number;
    let y: number;
    if (!dragged) {
      x = d.x1 - width / 2;
      y = d.y1 - height / 2;
    } else if (isSymbol(kind)) {
      width = height = Math.max(8, Math.abs(dx), Math.abs(dy));
      x = dx < 0 ? d.x1 - width : d.x1;
      y = dy < 0 ? d.y1 - height : d.y1;
    } else {
      x = Math.min(d.x1, d.x2);
      y = Math.min(d.y1, d.y2);
      width = Math.max(MIN_SHAPE_SIZE, Math.abs(dx));
      height = Math.max(MIN_SHAPE_SIZE, Math.abs(dy));
    }
    width = Math.min(width, size.width);
    height = Math.min(height, size.height);
    return {
      ...base,
      x: clamp(x, 0, size.width - width),
      y: clamp(y, 0, size.height - height),
      width,
      height,
    };
  };

  const handlePagePointerDown = (e: React.PointerEvent<HTMLDivElement>, page: number) => {
    if (!tool || tool === "text" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".pdf-annotation")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointInPage(e, page);
    setSelectedId(null);
    setDraft({ page, kind: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handlePagePointerMove = (e: React.PointerEvent<HTMLDivElement>, page: number) => {
    if (!draft || draft.page !== page) return;
    let { x, y } = pointInPage(e, page);
    if (draft.kind === "line" && e.shiftKey) {
      const snapped = snapToAngle(x - draft.x1, y - draft.y1);
      x = clamp(draft.x1 + snapped.dx, 0, pageSizes[page - 1].width);
      y = clamp(draft.y1 + snapped.dy, 0, pageSizes[page - 1].height);
    }
    setDraft({ ...draft, x2: x, y2: y });
  };

  const handlePagePointerUp = () => {
    if (!draft) return;
    const shape = shapeFromDraft(draft, crypto.randomUUID());
    setDraft(null);
    checkpoint();
    setAnnotations((prev) => [...prev, shape]);
    setSelectedId(shape.id);
    setTool(null);
    suppressNextPageClick();
  };

  // Close the shapes menu on outside click
  useEffect(() => {
    if (!isShapeMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!shapeMenuRef.current?.contains(e.target as Node)) setIsShapeMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isShapeMenuOpen]);

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
    if (!pdfDoc || isSignOpen) return;
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
        setTool(null);
        setDraft(null);
        setIsShapeMenuOpen(false);
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
    isSignOpen,
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
    const isShape = ann.type === "shape";
    const kind = ann.shape ?? "rect";
    // Flat covers keep their stacking order when selected, so text placed on top stays visible
    const keepsStackOrder = isShape && (kind === "whiteout" || isHighlight(kind));
    const lockAspect = ann.type === "image" || (isShape && isSymbol(kind));
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
              : lockAspect
                ? { topLeft: true, topRight: true, bottomLeft: true, bottomRight: true }
                : true
        }
        lockAspectRatio={lockAspect}
        resizeHandleComponent={
          isText
            ? { left: handle, right: handle }
            : lockAspect
              ? { topLeft: handle, topRight: handle, bottomLeft: handle, bottomRight: handle }
              : {
                  top: handle,
                  bottom: handle,
                  left: handle,
                  right: handle,
                  topLeft: handle,
                  topRight: handle,
                  bottomLeft: handle,
                  bottomRight: handle,
                }
        }
        resizeHandleStyles={{
          top: { height: 20, top: -10 },
          bottom: { height: 20, bottom: -10 },
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
            width: Math.max(isText ? MIN_TEXT_WIDTH : MIN_SHAPE_SIZE, ref.offsetWidth / scale),
            ...(isText ? {} : { height: Math.max(MIN_SHAPE_SIZE, ref.offsetHeight / scale) }),
          });
        }}
        bounds="parent"
        className={cn(
          "pdf-annotation",
          isSelected && !keepsStackOrder ? "z-20" : "z-10",
          isEditing ? "cursor-text" : "cursor-move"
        )}
        // Blend on the Rnd element itself: its transform makes it the stacking context
        style={isShape && isHighlight(kind) ? { mixBlendMode: "multiply" } : undefined}
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
              {isShape ? (
                <ShapeToolbar
                  kind={kind}
                  style={styleOf(ann)}
                  onChange={(updates) => updateStyle(ann.id, updates)}
                  onDelete={() => deleteAnnotation(ann.id)}
                />
              ) : (
                <TextToolbar
                  format={isText ? formatOf(ann) : undefined}
                  onChange={(updates) => updateFormat(ann.id, updates)}
                  onDelete={() => deleteAnnotation(ann.id)}
                />
              )}
            </div>
          )}

          {isShape ? (
            <ShapeBody ann={ann} scale={scale} />
          ) : isText ? (
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

  const renderLine = (ann: Annotation, size: PageSize) => (
    <LineShape
      key={ann.id}
      ann={ann}
      scale={scale}
      pageWidth={size.width}
      pageHeight={size.height}
      isSelected={ann.id === selectedId}
      onSelect={() => setSelectedId(ann.id)}
      onBeforeChange={checkpoint}
      onChange={(updates) => updateAnnotation(ann.id, updates)}
      onInteractionEnd={suppressNextPageClick}
      toolbar={
        <ShapeToolbar
          kind="line"
          style={styleOf(ann)}
          onChange={(updates) => updateStyle(ann.id, updates)}
          onDelete={() => deleteAnnotation(ann.id)}
        />
      }
    />
  );

  // Live preview of the shape being dragged out
  const renderDraft = (d: Draft) => {
    const preview = shapeFromDraft(d, "draft");
    if (preview.shape === "line") {
      return (
        <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
          <line
            x1={preview.x * scale}
            y1={preview.y * scale}
            x2={(preview.x2 ?? preview.x) * scale}
            y2={(preview.y2 ?? preview.y) * scale}
            stroke={styleOf(preview).stroke}
            strokeWidth={styleOf(preview).strokeWidth * scale}
            strokeLinecap="round"
          />
        </svg>
      );
    }
    return (
      <div
        className="pointer-events-none absolute z-30 outline outline-1 outline-dashed outline-blue-500"
        style={{
          left: preview.x * scale,
          top: preview.y * scale,
          width: (preview.width ?? 0) * scale,
          height: (preview.height ?? 0) * scale,
          mixBlendMode: isHighlight(d.kind) ? "multiply" : undefined,
        }}
      >
        <ShapeBody ann={preview} scale={scale} />
      </div>
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
          onClick={() => setTool((t) => (t === "text" ? null : "text"))}
        >
          <Type className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarButton
          label="Sign"
          title="Draw, type or upload a signature"
          onClick={() => setIsSignOpen(true)}
          className="bg-blue-500 text-white shadow-md shadow-blue-500/20 hover:-translate-y-0.5 hover:bg-blue-600 hover:text-white dark:text-white dark:hover:bg-blue-600 dark:hover:text-white"
        >
          <PenTool className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <div ref={shapeMenuRef} className="relative">
          <ToolbarButton
            label={activeShapeTool?.label ?? "Shapes"}
            title={activeShapeTool ? `${activeShapeTool.hint} — drag on the page (Esc to cancel)` : "Whiteout, highlight and shapes"}
            active={!!activeShapeTool || isShapeMenuOpen}
            onClick={() => setIsShapeMenuOpen((open) => !open)}
          >
            {activeShapeTool ? (
              <span className="flex h-6 w-6 items-center justify-center">{activeShapeTool.icon}</span>
            ) : (
              <Shapes className="h-6 w-6" strokeWidth={1.5} />
            )}
          </ToolbarButton>
          {isShapeMenuOpen && (
            <div
              role="menu"
              className="absolute left-1/2 top-full z-50 mt-3 w-60 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              {SHAPE_TOOLS.map((t) => (
                <button
                  key={t.kind}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setTool(t.kind);
                    setSelectedId(null);
                    setIsShapeMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    tool === t.kind
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="text-slate-500 dark:text-slate-400">{t.icon}</span>
                  <span className="flex flex-col">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

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
          title={annotations.length === 0 ? "Add text, a signature or a shape first" : "Download the edited PDF"}
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
                  onPointerDown={(e) => handlePagePointerDown(e, page)}
                  onPointerMove={(e) => handlePagePointerMove(e, page)}
                  onPointerUp={handlePagePointerUp}
                  className={cn(
                    "relative shrink-0 bg-white shadow-xl",
                    tool && "cursor-crosshair ring-2 ring-blue-500/40",
                    tool && tool !== "text" && "touch-none select-none"
                  )}
                  style={{ width: widthPx, height: size.height * scale, scrollMarginTop: SCROLL_PADDING_TOP - 8 }}
                >
                  <PdfPageCanvas pdfDoc={pdfDoc} pageNumber={page} scale={scale} />
                  {annotations
                    .filter((a) => a.page === page)
                    .map((ann) => (ann.shape === "line" ? renderLine(ann, size) : renderAnnotation(ann, widthPx)))}
                  {draft?.page === page && renderDraft(draft)}
                </div>
              );
            })}
        </div>
      </div>

      {isSignOpen && (
        <SignatureDialog
          onClose={() => setIsSignOpen(false)}
          onInsert={(dataUrl) => {
            setIsSignOpen(false);
            addImageAnnotation(dataUrl);
          }}
        />
      )}

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
