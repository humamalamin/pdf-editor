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
  PanelLeftClose,
  PanelLeftOpen,
  History,
  CircleCheck,
  TriangleAlert,
  LoaderCircle,
  Copy,
  Trash2,
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
import { snapBox, snapPoint, snapResize, type Box, type Guide } from "@/lib/snapping";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import TextToolbar from "@/components/TextToolbar";
import ShapeToolbar from "@/components/ShapeToolbar";
import { LineShape, ShapeBody, snapToAngle, type LineChangeInfo } from "@/components/ShapeView";
import PdfPageCanvas from "@/components/PdfPageCanvas";
import PageThumbnails, { THUMBNAIL_SIDEBAR_WIDTH } from "@/components/PageThumbnails";
import FormFieldsLayer from "@/components/FormFieldsLayer";
import { loadFormFields, type FormField, type FormValues } from "@/lib/forms";
import {
  clearSession,
  loadSession,
  saveSessionFile,
  saveSessionState,
  timeAgo,
  type SavedSession,
  type SessionState,
} from "@/lib/autosave";
import SignatureDialog from "@/components/SignatureDialog";
import { useI18n } from "@/i18n/client";
import { format, plural } from "@/i18n/config";
import { loadImage } from "@/lib/signature";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const DEFAULT_MAX_SCALE = 1.5;
// Space reserved above the pages for the floating toolbar (matches pt-36) and side padding (px-4)
const SCROLL_PADDING_TOP = 144;
const SCROLL_PADDING_X = 16;
const DUPLICATE_OFFSET = 12;
const CLIPBOARD_MIME = "application/x-pdfeditor-annotations";
const SNAP_THRESHOLD_PX = 6;

const isModifierClick = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  e.shiftKey || e.ctrlKey || e.metaKey;

// Moves an annotation by (dx, dy), keeping it on its page; lines move both ends
function translateAnnotation(ann: Annotation, dx: number, dy: number, size: PageSize): Annotation {
  if (ann.x2 !== undefined && ann.y2 !== undefined) {
    const mx = clamp(dx, -Math.min(ann.x, ann.x2), size.width - Math.max(ann.x, ann.x2));
    const my = clamp(dy, -Math.min(ann.y, ann.y2), size.height - Math.max(ann.y, ann.y2));
    return { ...ann, x: ann.x + mx, y: ann.y + my, x2: ann.x2 + mx, y2: ann.y2 + my };
  }
  const width = ann.type === "text" ? textBoxWidth(ann) : ann.width || 0;
  return {
    ...ann,
    x: clamp(ann.x + dx, 0, Math.max(0, size.width - width)),
    y: clamp(ann.y + dy, 0, size.height - 1),
  };
}
const AUTOSAVE_DELAY_MS = 800;
const THUMBNAILS_STORAGE_KEY = "pdfeditor.showThumbnails";
const THUMBNAILS_MIN_VIEWPORT = 1024; // open the page sidebar by default on wide screens

function initialShowThumbnails() {
  if (typeof window === "undefined") return false;
  try {
    const saved = localStorage.getItem(THUMBNAILS_STORAGE_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    // storage blocked: fall back to the viewport heuristic
  }
  return window.innerWidth >= THUMBNAILS_MIN_VIEWPORT;
}
const SIGNATURE_HEIGHT = 40;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type PageSize = { width: number; height: number }; // unscaled PDF points

type Tool = "text" | ShapeKind | null;
// Rubber-band selection rectangle on a page (PDF points)
type Marquee = { page: number; x1: number; y1: number; x2: number; y2: number };
// A shape being drawn by dragging on a page (PDF points)
type Draft = { page: number; kind: ShapeKind; x1: number; y1: number; x2: number; y2: number };

// Labels and hints come from the dictionary (editor.shapeTools)
const SHAPE_TOOLS: { kind: ShapeKind; icon: React.ReactNode }[] = [
  { kind: "whiteout", icon: <Eraser className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "highlight", icon: <Highlighter className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "rect", icon: <Square className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "ellipse", icon: <Circle className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "line", icon: <Slash className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "check", icon: <Check className="h-5 w-5" strokeWidth={1.5} /> },
  { kind: "cross", icon: <X className="h-5 w-5" strokeWidth={1.5} /> },
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
  const { t } = useI18n();
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
      placeholder={t.editor.typeHere}
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
  const { t, locale } = useI18n();
  const te = t.editor;
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
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [initialFormValues, setInitialFormValues] = useState<FormValues>({});
  const [highlightFields, setHighlightFields] = useState(true);
  const [showThumbnails, setShowThumbnails] = useState(initialShowThumbnails);
  const toggleThumbnails = () => {
    setShowThumbnails((show) => {
      try {
        localStorage.setItem(THUMBNAILS_STORAGE_KEY, show ? "0" : "1");
      } catch {
        // preference just won't persist
      }
      return !show;
    });
  };
  const changedFieldNames = Object.keys(formValues).filter((name) => formValues[name] !== initialFormValues[name]);
  const hasChanges = annotations.length > 0 || changedFieldNames.length > 0;
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resumable, setResumable] = useState<SavedSession | null>(null);
  const autosavedFileRef = useRef<File | null>(null); // the PDF currently stored in the autosave slot
  const pendingRestoreRef = useRef<SessionState | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Single-item features (toolbar, resize handles, editing) only apply to a lone selection
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectOnly = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // Set once a press on an annotation turns into a drag, so the trailing click doesn't reselect
  const dragMovedRef = useRef(false);
  // Drag in progress: positions come from the raw pointer movement so snapping never drifts
  const dragRef = useRef<{
    id: string;
    page: number;
    pointerX: number;
    pointerY: number;
    start: Box;
    last: { x: number; y: number };
    targets: Box[];
  } | null>(null);
  const rndRefs = useRef<Record<string, Rnd | null>>({});
  // Snap targets captured when a resize or line drag begins
  const resizeRef = useRef<{ targets: Box[]; aspect?: number } | null>(null);
  const lineTargetsRef = useRef<Box[] | null>(null);
  const [guides, setGuides] = useState<{ page: number; lines: Guide[] } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null); // hides the item toolbar mid-drag
  const clipboardRef = useRef<{ items: Annotation[]; text: string; pasteCount: number } | null>(null);
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
      setFormFields([]);
      setFormValues({});
      setInitialFormValues({});
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
      const form = await loadFormFields(pdf).catch((e) => {
        console.warn("Could not read form fields", e);
        return { fields: [], values: {} };
      });
      if (cancelled) return;
      setPdfDoc(pdf);
      setPageSizes(sizes);
      setFormFields(form.fields);
      setFormValues(form.values);
      setInitialFormValues(form.values);
      setCurrentPage(1);

      const restore = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      if (restore) {
        setFormValues({ ...form.values, ...restore.formValues });
        resetAnnotations(restore.annotations);
        pendingPageRef.current = restore.currentPage;
      }
      setScale(Math.min(DEFAULT_MAX_SCALE, fitWidthScale(sizes)));
    };

    loadPdf().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [pdfFile, fitWidthScale, resetAnnotations]);

  // ---- Autosave ----

  // Offer to resume the last session whenever the upload screen is showing
  useEffect(() => {
    if (pdfFile) return;
    let cancelled = false;
    loadSession().then((session) => {
      if (!cancelled) setResumable(session);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  // Debounced save of the edit state; the PDF itself is written once per document
  useEffect(() => {
    if (!pdfFile || !pdfDoc) return;
    if (!hasChanges) {
      // Every edit was undone/removed: don't offer to bring them back later
      if (autosavedFileRef.current === pdfFile) {
        autosavedFileRef.current = null;
        clearSession().then(() => setAutosaveStatus("idle"));
      }
      return;
    }
    const timer = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        if (autosavedFileRef.current !== pdfFile) {
          await saveSessionFile(pdfFile);
          autosavedFileRef.current = pdfFile;
        }
        await saveSessionState({
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
          annotations,
          formValues: Object.fromEntries(changedFieldNames.map((name) => [name, formValues[name]])),
          currentPage,
        });
        setAutosaveStatus("saved");
      } catch (e) {
        console.warn("Autosave failed", e);
        setAutosaveStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // changedFieldNames is derived from formValues/initialFormValues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile, pdfDoc, hasChanges, annotations, formValues, initialFormValues, currentPage]);

  // After resuming, jump back to the page the user was on
  useEffect(() => {
    const page = pendingPageRef.current;
    if (!pdfDoc || !page) return;
    pendingPageRef.current = null;
    requestAnimationFrame(() => {
      const pageEl = pageRefs.current[page - 1];
      if (pageEl) scrollRef.current?.scrollTo({ top: pageEl.offsetTop - (SCROLL_PADDING_TOP - 8) });
      setCurrentPage(page);
    });
  }, [pdfDoc, pageSizes]);

  const resumeSession = (session: SavedSession) => {
    pendingRestoreRef.current = session.state;
    autosavedFileRef.current = session.file;
    setResumable(null);
    setPdfFile(session.file);
    resetAnnotations([]);
  };

  const discardSession = () => {
    setResumable(null);
    clearSession();
  };

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
    const pageEl = pageRefs.current[target - 1];
    // Scroll only the editor (scrollIntoView would also scroll the window)
    scrollRef.current?.scrollTo({ top: (pageEl?.offsetTop ?? 0) - (SCROLL_PADDING_TOP - 8), behavior: "smooth" });
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
    setAutosaveStatus("idle");
    setPdfFile(null);
    setPdfDoc(null);
    resetAnnotations([]);
    setTool(null);
    selectOnly(null);
    setEditingId(null);
  };

  // Clicking empty page space either drops a new text box (in Add Text mode) or clears the selection.
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (suppressPageClickRef.current) return;
    if (tool && tool !== "text") return; // shapes are drawn with pointer events
    if (!isPlacingText) {
      selectOnly(null);
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
    selectOnly(id);
    setEditingId(id);
    setTool(null);
  };

  // Vertical middle of the visible part of a page (PDF points)
  const visibleMidY = (page: number) => {
    const pageEl = pageRefs.current[page - 1];
    const el = scrollRef.current;
    if (!pageEl || !el) return 40;
    const viewportMid = el.getBoundingClientRect().top + el.clientHeight / 2;
    return (viewportMid - pageEl.getBoundingClientRect().top) / scale;
  };

  // Adds an image (signature) in the middle of the visible part of the current page
  const addImageAnnotation = async (dataUrl: string) => {
    const img = await loadImage(dataUrl);
    const page = currentPage;
    const pageSize = pageSizes[page - 1];
    const height = SIGNATURE_HEIGHT;
    const width = Math.min(height * (img.width / img.height), pageSize.width * 0.8);
    let y = visibleMidY(page) - height / 2;
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
    selectOnly(newImage.id);
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

  const deleteAnnotations = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      checkpoint();
      setAnnotations((prev) => prev.filter((ann) => !ids.includes(ann.id)));
      setSelectedIds((sel) => sel.filter((id) => !ids.includes(id)));
      setEditingId((edit) => (edit && ids.includes(edit) ? null : edit));
    },
    [checkpoint, setAnnotations]
  );
  const deleteAnnotation = (id: string) => deleteAnnotations([id]);

  // Adds copies of annotations (new ids), moved by an offset and kept on their page. Selects them.
  const insertCopies = useCallback(
    (items: Annotation[], page: number | null, offset: number) => {
      const copies = items.map((ann) => {
        const targetPage = page ?? ann.page;
        const size = pageSizes[targetPage - 1];
        return translateAnnotation({ ...ann, id: crypto.randomUUID(), page: targetPage }, offset, offset, size);
      });
      if (copies.length === 0) return;
      checkpoint();
      setAnnotations((prev) => [...prev, ...copies]);
      setSelectedIds(copies.map((c) => c.id));
    },
    [pageSizes, checkpoint, setAnnotations]
  );

  const duplicateAnnotations = useCallback(
    (ids: string[]) => insertCopies(annotations.filter((a) => ids.includes(a.id)), null, DUPLICATE_OFFSET),
    [annotations, insertCopies]
  );

  const nudgeAnnotations = useCallback(
    (ids: string[], dx: number, dy: number) => {
      setAnnotations((prev) =>
        prev.map((ann) => (ids.includes(ann.id) ? translateAnnotation(ann, dx, dy, pageSizes[ann.page - 1]) : ann))
      );
    },
    [pageSizes, setAnnotations]
  );

  // Pressing an annotation: modifier keys toggle it in the selection; otherwise keep an existing
  // group (so it can be dragged together) or select just this one
  const pressAnnotation = (id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    dragMovedRef.current = false;
    if (isModifierClick(e)) {
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
    } else if (!selectedIds.includes(id)) {
      selectOnly(id);
    }
  };

  // A plain click (no drag) on a member of a group narrows the selection to it
  const clickAnnotation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isModifierClick(e) || dragMovedRef.current) return;
    selectOnly(id);
  };

  // Called with the dragged item's incremental move; the rest of the group follows
  const dragGroupBy = (id: string, dx: number, dy: number) => {
    if (!dx && !dy) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current = true;
      checkpoint();
    }
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      nudgeAnnotations(
        selectedIds.filter((other) => other !== id),
        dx,
        dy
      );
    }
  };

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
    if (tool === "text" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".pdf-annotation")) return;
    if (!tool) {
      // Empty page area with no tool: rubber-band selection
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pointInPage(e, page);
      setMarquee({ page, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointInPage(e, page);
    selectOnly(null);
    setDraft({ page, kind: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handlePagePointerMove = (e: React.PointerEvent<HTMLDivElement>, page: number) => {
    if (marquee?.page === page) {
      const p = pointInPage(e, page);
      setMarquee({ ...marquee, x2: p.x, y2: p.y });
      return;
    }
    if (!draft || draft.page !== page) return;
    let { x, y } = pointInPage(e, page);
    if (draft.kind === "line" && e.shiftKey) {
      const snapped = snapToAngle(x - draft.x1, y - draft.y1);
      x = clamp(draft.x1 + snapped.dx, 0, pageSizes[page - 1].width);
      y = clamp(draft.y1 + snapped.dy, 0, pageSizes[page - 1].height);
    }
    setDraft({ ...draft, x2: x, y2: y });
  };

  const handlePagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (marquee) {
      finishMarquee(marquee, e.shiftKey || e.ctrlKey || e.metaKey);
      return;
    }
    if (!draft) return;
    const shape = shapeFromDraft(draft, crypto.randomUUID());
    setDraft(null);
    checkpoint();
    setAnnotations((prev) => [...prev, shape]);
    selectOnly(shape.id);
    setTool(null);
    suppressNextPageClick();
  };

  const finishMarquee = (m: Marquee, additive: boolean) => {
    setMarquee(null);
    const pageEl = pageRefs.current[m.page - 1];
    // A plain click: leave it to the page click handler (deselect)
    if (!pageEl || Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * scale < MIN_DRAG_PX) return;
    const pageRect = pageEl.getBoundingClientRect();
    const left = Math.min(m.x1, m.x2) * scale;
    const right = Math.max(m.x1, m.x2) * scale;
    const top = Math.min(m.y1, m.y2) * scale;
    const bottom = Math.max(m.y1, m.y2) * scale;
    // Hit-test the rendered boxes: text height only exists in the DOM
    const hits = [...pageEl.querySelectorAll<HTMLElement>("[data-ann-id]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.right - pageRect.left > left &&
          r.left - pageRect.left < right &&
          r.bottom - pageRect.top > top &&
          r.top - pageRect.top < bottom
        );
      })
      .map((el) => el.dataset.annId!);
    setSelectedIds((ids) => (additive ? [...new Set([...ids, ...hits])] : hits));
    suppressNextPageClick();
  };

  // ---- Clipboard ----

  const pasteAnnotations = (items: Annotation[], text: string) => {
    const clip = clipboardRef.current;
    const page = currentPage;
    // Same page as the source: step each paste down-right so copies don't stack exactly
    const samePage = items.every((a) => a.page === page);
    let offset = 0;
    if (samePage) {
      const count = clip && clip.text === text ? ++clip.pasteCount : 1;
      offset = DUPLICATE_OFFSET * count;
    }
    insertCopies(items, page, offset);
  };

  const pasteText = (text: string) => {
    const format = lastFormatRef.current;
    const page = currentPage;
    const size = pageSizes[page - 1];
    const ann: Annotation = {
      id: crypto.randomUUID(),
      type: "text",
      page,
      x: 0,
      y: 0,
      content: text.replace(/\r\n?/g, "\n").trimEnd(),
      format,
    };
    const width = Math.min(textBoxWidth(ann), size.width - 20);
    const placed = {
      ...ann,
      // Long pasted text wraps inside the page instead of running off it
      width: textBoxWidth(ann) > size.width - 20 ? width : undefined,
      x: Math.max(0, (size.width - width) / 2),
      y: clamp(visibleMidY(page), 0, size.height - format.fontSize),
    };
    checkpoint();
    setAnnotations((prev) => [...prev, placed]);
    selectOnly(placed.id);
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
        else if (key === "d" && selectedIds.length > 0) duplicateAnnotations(selectedIds);
        else if (key === "a") setSelectedIds(annotations.filter((a) => a.page === currentPage).map((a) => a.id));
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
        selectOnly(null);
        return;
      }
      if (selectedIds.length === 0) return;

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
        nudgeAnnotations(selectedIds, dx * step, dy * step);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteAnnotations(selectedIds);
      } else if (e.key === "Enter" && selectedId) {
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
    selectedIds,
    annotations,
    currentPage,
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomToFit,
    checkpoint,
    nudgeAnnotations,
    deleteAnnotations,
    duplicateAnnotations,
    startEditing,
    toggleFormatShortcut,
  ]);

  // Copy / cut / paste. Uses the system clipboard (custom MIME type + plain text), so copies also
  // move between tabs; pasting an image or plain text from other apps adds it as an annotation.
  useEffect(() => {
    if (!pdfDoc || isSignOpen) return;
    const inField = (e: Event) => (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");

    const onCopy = (cut: boolean) => (e: ClipboardEvent) => {
      if (inField(e) || selectedIds.length === 0) return;
      const items = annotations.filter((a) => selectedIds.includes(a.id));
      if (items.length === 0) return;
      e.preventDefault();
      const text = items.filter((a) => a.type === "text").map((a) => a.content).join("\n");
      clipboardRef.current = { items, text, pasteCount: 0 };
      e.clipboardData?.setData(CLIPBOARD_MIME, JSON.stringify(items));
      e.clipboardData?.setData("text/plain", text);
      if (cut) deleteAnnotations(selectedIds);
    };
    const handleCopy = onCopy(false);
    const handleCut = onCopy(true);

    const handlePaste = (e: ClipboardEvent) => {
      if (inField(e) || !e.clipboardData) return;
      const data = e.clipboardData;
      const text = data.getData("text/plain");
      let items: Annotation[] | null = null;
      try {
        const json = data.getData(CLIPBOARD_MIME);
        if (json) items = JSON.parse(json);
      } catch {
        items = null;
      }
      // Some browsers drop custom types: fall back to our own copy if the text still matches
      if (!items && clipboardRef.current && clipboardRef.current.text === text) items = clipboardRef.current.items;

      const image = [...data.files].find((f) => f.type === "image/png" || f.type === "image/jpeg");
      if (items?.length) {
        e.preventDefault();
        pasteAnnotations(items, text);
      } else if (image) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => addImageAnnotation(reader.result as string);
        reader.readAsDataURL(image);
      } else if (text.trim()) {
        e.preventDefault();
        pasteText(text);
      }
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
    };
  });

  const downloadPdf = async () => {
    if (!pdfFile || !hasChanges) return;
    setIsExporting(true);

    try {
      const pdfBytes = await exportAnnotatedPdf(await pdfFile.arrayBuffer(), annotations, {
        fields: formFields,
        values: formValues,
        changed: changedFieldNames,
      });
      if (!pdfBytes) return;

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = pdfFile.name.replace(/\.[^/.]+$/, "");
      a.download = `${te.filePrefix}_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Failed to export PDF", e);
      alert(te.exportFailed);
    } finally {
      setIsExporting(false);
    }
  };

  if (!pdfFile) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-auto p-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">{te.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
            {te.subtitle}
          </p>
          <PrivacyNote />
        </header>
        {resumable && (
          <div className="mb-6 flex w-full max-w-xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
            <History className="h-8 w-8 shrink-0 text-blue-500" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-800 dark:text-white" title={resumable.state.fileName}>
                {resumable.state.fileName}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {plural(
                  resumable.state.annotations.length + Object.keys(resumable.state.formValues).length,
                  te.editsOne,
                  te.editsOther
                )}{" "}
                · {format(te.lastEdited, { time: timeAgo(resumable.state.savedAt, locale, te.justNow) })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={discardSession}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {te.discard}
              </button>
              <button
                type="button"
                onClick={() => resumeSession(resumable)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                {te.continueEditing}
              </button>
            </div>
          </div>
        )}
        <label
          {...dropProps}
          className={cn(
            "flex h-64 w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80",
            isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
          )}
        >
          <Upload className="mb-4 h-12 w-12 text-slate-400" />
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {te.uploadPrompt}
          </p>
          <p className="text-xs text-slate-500">{te.maxSize}</p>
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

  const pointerOf = (e: MouseEvent | TouchEvent) =>
    "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e;

  // Boxes (PDF points) of everything on the page except the items being dragged, read from the
  // DOM because a text box's height only exists there
  const boxesOnPage = (page: number, exclude: string[]) => {
    const pageEl = pageRefs.current[page - 1];
    if (!pageEl) return { boxes: [] as Box[], byId: {} as Record<string, Box> };
    const pageRect = pageEl.getBoundingClientRect();
    const byId: Record<string, Box> = {};
    pageEl.querySelectorAll<HTMLElement>("[data-ann-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      byId[el.dataset.annId!] = {
        x: (r.left - pageRect.left) / scale,
        y: (r.top - pageRect.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      };
    });
    // A line's DOM box includes its grab padding: use the actual end points instead
    for (const ann of annotations) {
      if (ann.page !== page || ann.x2 === undefined || ann.y2 === undefined) continue;
      byId[ann.id] = {
        x: Math.min(ann.x, ann.x2),
        y: Math.min(ann.y, ann.y2),
        w: Math.abs(ann.x2 - ann.x),
        h: Math.abs(ann.y2 - ann.y),
      };
    }
    return { boxes: Object.entries(byId).filter(([id]) => !exclude.includes(id)).map(([, b]) => b), byId };
  };

  const startDrag = (ann: Annotation, e: MouseEvent | TouchEvent) => {
    const group = selectedIds.includes(ann.id) && !isModifierClick(e) ? selectedIds : [ann.id];
    const { boxes, byId } = boxesOnPage(ann.page, group);
    const p = pointerOf(e);
    dragRef.current = {
      id: ann.id,
      page: ann.page,
      pointerX: p.clientX,
      pointerY: p.clientY,
      start: { ...(byId[ann.id] ?? { w: 0, h: 0 }), x: ann.x, y: ann.y },
      last: { x: ann.x, y: ann.y },
      targets: boxes,
    };
  };

  const moveDrag = (e: MouseEvent | TouchEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = pointerOf(e);
    const size = pageSizes[drag.page - 1];
    const { start } = drag;
    let x = clamp(start.x + (p.clientX - drag.pointerX) / scale, 0, Math.max(0, size.width - start.w));
    let y = clamp(start.y + (p.clientY - drag.pointerY) / scale, 0, Math.max(0, size.height - start.h));

    // Alt/Option temporarily turns snapping off
    if (!e.altKey) {
      const snapped = snapBox({ ...start, x, y }, drag.targets, size, SNAP_THRESHOLD_PX / scale);
      x = clamp(snapped.x, 0, Math.max(0, size.width - start.w));
      y = clamp(snapped.y, 0, Math.max(0, size.height - start.h));
      setGuides(snapped.guides.length ? { page: drag.page, lines: snapped.guides } : null);
    } else {
      setGuides(null);
    }

    const dx = x - drag.last.x;
    const dy = y - drag.last.y;
    drag.last = { x, y };
    if (dx || dy) setDraggingId(drag.id);
    dragGroupBy(drag.id, dx, dy);
    // Override react-draggable's own position after it applies this move
    queueMicrotask(() => rndRefs.current[drag.id]?.updatePosition({ x: x * scale, y: y * scale }));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides(null);
    setDraggingId(null);
    suppressNextPageClick();
    if (drag && dragMovedRef.current) updateAnnotation(drag.id, drag.last);
  };

  const renderAnnotation = (ann: Annotation, pageWidthPx: number) => {
    const isSelected = selectedIds.includes(ann.id);
    const isOnlySelected = ann.id === selectedId;
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
        ref={(rnd) => {
          rndRefs.current[ann.id] = rnd;
        }}
        position={{ x: ann.x * scale, y: ann.y * scale }}
        size={
          isText
            ? { width: textBoxWidth(ann) * scale, height: "auto" }
            : { width: (ann.width || 100) * scale, height: (ann.height || 50) * scale }
        }
        disableDragging={isEditing}
        enableResizing={
          !isOnlySelected || isEditing
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
        onDragStart={(e) => {
          pressAnnotation(ann.id, e as MouseEvent);
          startDrag(ann, e as MouseEvent | TouchEvent);
        }}
        onDrag={(e) => moveDrag(e as MouseEvent | TouchEvent)}
        onDragStop={endDrag}
        onResizeStart={() => {
          checkpoint();
          resizeRef.current = {
            targets: boxesOnPage(ann.page, [ann.id]).boxes,
            aspect: lockAspect && ann.width && ann.height ? ann.width / ann.height : undefined,
          };
        }}
        onResizeStop={() => {
          resizeRef.current = null;
          setGuides(null);
          suppressNextPageClick();
        }}
        onResize={(e, direction, ref, delta, position) => {
          // getBoundingClientRect, not offsetWidth/Height: those round to whole pixels and would
          // nudge the size on every resize
          const rect = ref.getBoundingClientRect();
          let box = { x: position.x / scale, y: position.y / scale, w: rect.width / scale, h: rect.height / scale };
          const resize = resizeRef.current;
          if (resize && !(e as MouseEvent).altKey) {
            const dir = direction.toLowerCase();
            const snapped = snapResize(
              box,
              { left: dir.includes("left"), right: dir.includes("right"), top: dir.includes("top"), bottom: dir.includes("bottom") },
              resize.targets,
              pageSizes[ann.page - 1],
              SNAP_THRESHOLD_PX / scale,
              resize.aspect
            );
            box = snapped;
            setGuides(snapped.guides.length ? { page: ann.page, lines: snapped.guides } : null);
          } else {
            setGuides(null);
          }
          const width = Math.max(isText ? MIN_TEXT_WIDTH : MIN_SHAPE_SIZE, box.w);
          const height = Math.max(MIN_SHAPE_SIZE, box.h);
          updateAnnotation(ann.id, { x: box.x, y: box.y, width, ...(isText ? {} : { height }) });
          // Keep Rnd's internal state on the snapped box (it would otherwise follow the raw pointer)
          queueMicrotask(() => {
            const rnd = rndRefs.current[ann.id];
            rnd?.updatePosition({ x: box.x * scale, y: box.y * scale });
            rnd?.updateSize({ width: width * scale, height: isText ? "auto" : height * scale });
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
          data-ann-id={ann.id}
          onClick={(e) => clickAnnotation(ann.id, e)}
          onDoubleClick={() => {
            if (isText && !isEditing) startEditing(ann.id);
          }}
          title={isText && !isEditing ? te.doubleClickToEdit : undefined}
        >
          {isOnlySelected && draggingId !== ann.id && (
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
              alt={te.sign}
              className="pointer-events-none h-full w-full object-contain"
              draggable={false}
            />
          )}
        </div>
      </Rnd>
    );
  };

  const snapLineChange = (ann: Annotation, updates: Partial<Annotation>, info: LineChangeInfo) => {
    const size = pageSizes[ann.page - 1];
    const targets = lineTargetsRef.current;
    const threshold = SNAP_THRESHOLD_PX / scale;
    let u = updates;
    let lines: Guide[] = [];

    if (targets && !info.altKey) {
      if (info.mode === "move" && u.x !== undefined && u.y !== undefined && u.x2 !== undefined && u.y2 !== undefined) {
        const box = { x: Math.min(u.x, u.x2), y: Math.min(u.y, u.y2), w: Math.abs(u.x2 - u.x), h: Math.abs(u.y2 - u.y) };
        const snapped = snapBox(box, targets, size, threshold);
        const dx = snapped.x - box.x;
        const dy = snapped.y - box.y;
        // Only accept a snap that keeps the whole line on the page
        if (box.x + dx >= 0 && box.x + box.w + dx <= size.width && box.y + dy >= 0 && box.y + box.h + dy <= size.height) {
          u = { x: u.x + dx, y: u.y + dy, x2: u.x2 + dx, y2: u.y2 + dy };
          lines = snapped.guides;
        }
      } else if (info.mode !== "move" && !info.shiftKey) {
        // Shift already constrains the angle; otherwise the dragged end snaps to edges/centres
        const point = info.mode === "start" ? { x: u.x ?? ann.x, y: u.y ?? ann.y } : { x: u.x2 ?? ann.x, y: u.y2 ?? ann.y };
        const snapped = snapPoint(point, targets, size, threshold);
        u = info.mode === "start" ? { x: snapped.x, y: snapped.y } : { x2: snapped.x, y2: snapped.y };
        lines = snapped.guides;
      }
    }
    setGuides(lines.length ? { page: ann.page, lines } : null);

    // Moving the whole line (not one end) drags the rest of the selection along
    if (u.x !== undefined && u.x2 !== undefined && selectedIds.length > 1) {
      nudgeAnnotations(
        selectedIds.filter((id) => id !== ann.id),
        u.x - ann.x,
        (u.y ?? ann.y) - ann.y
      );
    }
    updateAnnotation(ann.id, u);
  };

  const renderLine = (ann: Annotation, size: PageSize) => (
    <LineShape
      key={ann.id}
      ann={ann}
      scale={scale}
      pageWidth={size.width}
      pageHeight={size.height}
      isSelected={selectedIds.includes(ann.id)}
      isOnlySelected={ann.id === selectedId}
      onPress={(e) => pressAnnotation(ann.id, e)}
      onClickLine={(e) => clickAnnotation(ann.id, e)}
      onBeforeChange={() => {
        dragMovedRef.current = true;
        checkpoint();
        const group = selectedIds.includes(ann.id) ? selectedIds : [ann.id];
        lineTargetsRef.current = boxesOnPage(ann.page, group).boxes;
      }}
      onChange={(updates, info) => snapLineChange(ann, updates, info)}
      onInteractionEnd={() => {
        lineTargetsRef.current = null;
        setGuides(null);
        suppressNextPageClick();
      }}
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
        <ToolbarButton label={te.upload} title={format(te.activeFile, { name: pdfFile.name })} onClick={handleClear}>
          <Upload className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label={te.addText}
          title={isPlacingText ? te.addTextActive : te.addText}
          active={isPlacingText}
          onClick={() => setTool((t) => (t === "text" ? null : "text"))}
        >
          <Type className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarButton
          label={te.sign}
          title={te.signHint}
          onClick={() => setIsSignOpen(true)}
          className="bg-blue-500 text-white shadow-md shadow-blue-500/20 hover:-translate-y-0.5 hover:bg-blue-600 hover:text-white dark:text-white dark:hover:bg-blue-600 dark:hover:text-white"
        >
          <PenTool className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <div ref={shapeMenuRef} className="relative">
          <ToolbarButton
            label={activeShapeTool ? te.shapeTools[activeShapeTool.kind].label : te.shapes}
            title={
              activeShapeTool
                ? format(te.shapeActiveHint, { hint: te.shapeTools[activeShapeTool.kind].hint })
                : te.shapesHint
            }
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
              {SHAPE_TOOLS.map((s) => (
                <button
                  key={s.kind}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setTool(s.kind);
                    selectOnly(null);
                    setIsShapeMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    tool === s.kind
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="text-slate-500 dark:text-slate-400">{s.icon}</span>
                  <span className="flex flex-col">
                    <span className="font-medium">{te.shapeTools[s.kind].label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{te.shapeTools[s.kind].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarDivider />

        <ToolbarButton label={te.undo} title={te.undoHint} onClick={undo} disabled={!canUndo}>
          <Undo2 className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>
        <ToolbarButton label={te.redo} title={te.redoHint} onClick={redo} disabled={!canRedo}>
          <Redo2 className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label={isExporting ? te.saving : te.save}
          title={hasChanges ? te.saveHint : te.saveDisabledHint}
          onClick={downloadPdf}
          disabled={isExporting || !hasChanges}
          className="hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
        >
          <Save className="h-6 w-6" strokeWidth={1.5} />
        </ToolbarButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Mounted before the PDF finishes loading, so the initial fit-to-width already accounts for it */}
        {showThumbnails && (
          <PageThumbnails
            pdfDoc={pdfDoc}
            pageSizes={pageSizes}
            currentPage={currentPage}
            editCounts={pageSizes.map(
              (_, i) =>
                annotations.filter((a) => a.page === i + 1).length +
                changedFieldNames.filter((name) => formFields.some((f) => f.name === name && f.page === i + 1)).length
            )}
            onSelect={goToPage}
          />
        )}

        {/* Editor Area: every page stacked vertically */}
        <div ref={scrollRef} data-scroll-root onScroll={updateCurrentPage} className="hide-scrollbar relative flex-1 overflow-auto pt-36 pb-20 px-4">
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
                      tool && tool !== "text" && "touch-none select-none",
                    marquee && "select-none"
                    )}
                    style={{ width: widthPx, height: size.height * scale, scrollMarginTop: SCROLL_PADDING_TOP - 8 }}
                  >
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={page}
                      scale={scale}
                      hideFormWidgets={formFields.some((f) => f.page === page)}
                    />
                    <FormFieldsLayer
                      fields={formFields.filter((f) => f.page === page)}
                      values={formValues}
                      scale={scale}
                      highlight={highlightFields}
                      inactive={tool !== null}
                      onChange={(name, value) => setFormValues((prev) => ({ ...prev, [name]: value }))}
                    />
                    {annotations
                      .filter((a) => a.page === page)
                      .map((ann) => (ann.shape === "line" ? renderLine(ann, size) : renderAnnotation(ann, widthPx)))}
                    {draft?.page === page && renderDraft(draft)}
                  {guides?.page === page &&
                    guides.lines.map((g) => {
                      const vertical = g.orientation === "vertical";
                      const lineStyle: React.CSSProperties = vertical
                        ? { left: g.pos * scale, top: g.from * scale, width: 1, height: (g.to - g.from) * scale }
                        : { top: g.pos * scale, left: g.from * scale, height: 1, width: (g.to - g.from) * scale };
                      if (g.kind === "align") {
                        return (
                          <div
                            key={`a-${g.orientation}-${g.pos}`}
                            className="pointer-events-none absolute z-40 bg-pink-500"
                            style={lineStyle}
                          />
                        );
                      }
                      // Equal-spacing marker: line with end ticks and the gap size
                      return (
                        <div
                          key={`g-${g.orientation}-${g.pos}-${g.from}`}
                          className="pointer-events-none absolute z-40 bg-pink-500"
                          style={lineStyle}
                        >
                          <span className={cn("absolute bg-pink-500", vertical ? "-left-[3px] top-0 h-px w-[7px]" : "-top-[3px] left-0 h-[7px] w-px")} />
                          <span className={cn("absolute bg-pink-500", vertical ? "-left-[3px] bottom-0 h-px w-[7px]" : "-top-[3px] right-0 h-[7px] w-px")} />
                          <span
                            className={cn(
                              "absolute whitespace-nowrap rounded bg-pink-500 px-1 text-[10px] font-semibold leading-4 text-white",
                              vertical ? "left-1.5 top-1/2 -translate-y-1/2" : "-top-5 left-1/2 -translate-x-1/2"
                            )}
                          >
                            {g.label}
                          </span>
                        </div>
                      );
                    })}
                  {marquee?.page === page && (
                    <div
                      className="pointer-events-none absolute z-40 border border-blue-500 bg-blue-500/10"
                      style={{
                        left: Math.min(marquee.x1, marquee.x2) * scale,
                        top: Math.min(marquee.y1, marquee.y2) * scale,
                        width: Math.abs(marquee.x2 - marquee.x1) * scale,
                        height: Math.abs(marquee.y2 - marquee.y1) * scale,
                      }}
                    />
                  )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {selectedIds.length > 1 && (
        <div className="absolute left-1/2 top-[7.25rem] z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <span className="px-2 font-medium">{format(te.selected, { count: selectedIds.length })}</span>
          <div className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            onClick={() => duplicateAnnotations(selectedIds)}
            title={te.duplicateHint}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Copy className="h-4 w-4" /> {te.duplicate}
          </button>
          <button
            type="button"
            onClick={() => deleteAnnotations(selectedIds)}
            title={te.deleteHint}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4" /> {te.delete}
          </button>
          <button
            type="button"
            onClick={() => selectOnly(null)}
            title={te.clearSelection}
            aria-label={te.clearSelection}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isSignOpen && (
        <SignatureDialog
          onClose={() => setIsSignOpen(false)}
          onInsert={(dataUrl) => {
            setIsSignOpen(false);
            addImageAnnotation(dataUrl);
          }}
        />
      )}

      {formFields.length > 0 && (
        <div
          style={{ left: (showThumbnails ? THUMBNAIL_SIDEBAR_WIDTH : 0) + 24 }}
          className="absolute bottom-6 z-50 flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-800/90 dark:text-slate-200">
          <span>
            <span className="font-semibold">{new Set(formFields.map((f) => f.name)).size}</span> {te.fillableFields}
            {changedFieldNames.length > 0 && (
              <span className="text-slate-500 dark:text-slate-400">
                {" "}
                · {format(te.filled, { count: changedFieldNames.length })}
              </span>
            )}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={highlightFields}
              onChange={(e) => setHighlightFields(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            {te.highlightFields}
          </label>
        </div>
      )}

      {/* Floating zoom + pagination, bottom right */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-1 rounded-xl bg-white/90 p-1.5 shadow-lg backdrop-blur-md border border-slate-200/60 text-slate-600 dark:bg-slate-800/90 dark:border-slate-700/60 dark:text-slate-300">
        {autosaveStatus !== "idle" && (
          <>
            <span
              className="flex items-center gap-1.5 px-1.5 text-xs text-slate-500 dark:text-slate-400"
              title={
                autosaveStatus === "error"
                  ? te.autosaveBlocked
                  : te.autosaveInfo
              }
            >
              {autosaveStatus === "saving" && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {autosaveStatus === "saved" && <CircleCheck className="h-4 w-4 text-emerald-500" />}
              {autosaveStatus === "error" && <TriangleAlert className="h-4 w-4 text-amber-500" />}
              <span className="hidden sm:inline">
                {autosaveStatus === "saving" ? te.autosaveSaving : autosaveStatus === "saved" ? te.autosaveSaved : te.autosaveOff}
              </span>
            </span>
            <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />
          </>
        )}
        <button
          onClick={toggleThumbnails}
          title={showThumbnails ? te.hideThumbnails : te.showThumbnails}
          aria-label={showThumbnails ? te.hideThumbnails : te.showThumbnails}
          aria-pressed={showThumbnails}
          className={cn(
            "rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700",
            showThumbnails && "text-blue-600 dark:text-blue-400"
          )}
        >
          {showThumbnails ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          onClick={zoomOut}
          disabled={scale <= MIN_ZOOM}
          title={te.zoomOut}
          aria-label={te.zoomOut}
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={zoomToFit}
          title={te.zoomFit}
          className="min-w-[3.5rem] rounded-lg px-1.5 py-1 text-center text-sm font-medium tabular-nums hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={scale >= MAX_ZOOM}
          title={te.zoomIn}
          aria-label={te.zoomIn}
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ZoomIn className="h-5 w-5" />
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          title={te.prevPage}
          aria-label={te.prevPage}
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[5.5rem] px-2 text-center text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
          {format(te.pageOf, { current: currentPage, total: pageSizes.length })}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= pageSizes.length}
          title={te.nextPage}
          aria-label={te.nextPage}
          className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
