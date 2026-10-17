// Freehand pen strokes. A stroke is stored relative to its own box at the size it was drawn
// (`width` × `height`), so moving or resizing the annotation just scales the points.

export type InkPoint = [number, number];
export type InkData = { points: InkPoint[]; width: number; height: number };

/** Points closer than this (PDF points) to the previous one are dropped while drawing. */
export const MIN_POINT_DISTANCE = 0.75;

/** Smooth SVG path through the points: quadratic curves via the midpoints between samples. */
export function smoothPath(points: InkPoint[]) {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 100) / 100;
  const [x0, y0] = points[0];
  // A single tap still leaves a visible dot (the round line cap draws it)
  if (points.length === 1) return `M ${f(x0)} ${f(y0)} L ${f(x0 + 0.01)} ${f(y0)}`;
  if (points.length === 2) return `M ${f(x0)} ${f(y0)} L ${f(points[1][0])} ${f(points[1][1])}`;

  let d = `M ${f(x0)} ${f(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${f(lx)} ${f(ly)}`;
}

/**
 * Turns page-space points into an annotation box plus box-local points. The box is padded by
 * half the stroke width so the line isn't clipped at the edges.
 */
export function inkFromStroke(pagePoints: InkPoint[], strokeWidth: number) {
  const pad = strokeWidth / 2;
  const xs = pagePoints.map((p) => p[0]);
  const ys = pagePoints.map((p) => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const width = Math.max(1, Math.max(...xs) + pad - x);
  const height = Math.max(1, Math.max(...ys) + pad - y);
  const points = pagePoints.map(([px, py]): InkPoint => [px - x, py - y]);
  return { x, y, width, height, ink: { points, width, height } satisfies InkData };
}

/** The stroke's points scaled to the annotation's current box size (box-local, PDF points). */
export function inkPointsForBox(ink: InkData, width: number, height: number): InkPoint[] {
  const sx = ink.width ? width / ink.width : 1;
  const sy = ink.height ? height / ink.height : 1;
  return ink.points.map(([x, y]) => [x * sx, y * sy]);
}
