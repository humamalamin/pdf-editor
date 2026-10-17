export type ShapeKind = "whiteout" | "redact" | "highlight" | "rect" | "ellipse" | "line" | "check" | "cross" | "ink";

export type ShapeStyle = {
  stroke: string; // #rrggbb
  fill: string | null; // null = no fill
  strokeWidth: number; // PDF points
  opacity: number; // 0..1
};

export const SHAPE_DEFAULTS: Record<ShapeKind, ShapeStyle> = {
  whiteout: { stroke: "#ffffff", fill: "#ffffff", strokeWidth: 0, opacity: 1 },
  redact: { stroke: "#000000", fill: "#000000", strokeWidth: 0, opacity: 1 },
  highlight: { stroke: "#fde047", fill: "#fde047", strokeWidth: 0, opacity: 0.5 },
  rect: { stroke: "#dc2626", fill: null, strokeWidth: 2, opacity: 1 },
  ellipse: { stroke: "#dc2626", fill: null, strokeWidth: 2, opacity: 1 },
  line: { stroke: "#dc2626", fill: null, strokeWidth: 2, opacity: 1 },
  check: { stroke: "#16a34a", fill: null, strokeWidth: 3, opacity: 1 },
  cross: { stroke: "#dc2626", fill: null, strokeWidth: 3, opacity: 1 },
  ink: { stroke: "#2563eb", fill: null, strokeWidth: 2, opacity: 1 },
};

// Size used when the user clicks instead of dragging (PDF points)
export const SHAPE_DEFAULT_SIZE: Record<ShapeKind, { width: number; height: number }> = {
  whiteout: { width: 120, height: 24 },
  redact: { width: 120, height: 20 },
  highlight: { width: 120, height: 16 },
  rect: { width: 120, height: 60 },
  ellipse: { width: 90, height: 60 },
  line: { width: 120, height: 0 },
  check: { width: 20, height: 20 },
  cross: { width: 20, height: 20 },
  ink: { width: 0, height: 0 }, // always drawn, never placed with a click
};

/** Shapes whose box keeps a 1:1 aspect ratio */
export const isSymbol = (kind: ShapeKind) => kind === "check" || kind === "cross";

/** Opaque filled boxes that hide what is under them (redaction also removes it on export) */
export const isCover = (kind: ShapeKind) => kind === "whiteout" || kind === "redact";

/** Removes the covered content for real: the page is turned into an image on export */
export const isRedaction = (kind: ShapeKind | undefined) => kind === "redact";

export const REDACT_COLORS = ["#000000", "#ffffff"];

/** Flat translucent fills that sit "under" the page content via multiply blending */
export const isHighlight = (kind: ShapeKind) => kind === "highlight";

// Symbol paths in a 24×24 box (y down), shared by the on-screen SVG and the PDF export
export const SYMBOL_PATHS: Record<"check" | "cross", string> = {
  check: "M4 12.5 L9.5 18 L20 6",
  cross: "M6 6 L18 18 M18 6 L6 18",
};
export const SYMBOL_BOX = 24;

export const STROKE_COLORS = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#f59e0b"];
export const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd"];
export const FILL_COLORS = ["#ffffff", "#fef9c3", "#e2e8f0", "#000000"];
export const STROKE_WIDTHS = [1, 2, 3, 5];
