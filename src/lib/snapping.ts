// Smart guides, all in PDF points:
// - alignment: left/centre/right and top/middle/bottom edges line up with other boxes or the
//   page centre lines;
// - equal spacing: a box sits exactly between its neighbours, or repeats a gap already used
//   between other boxes in the same row/column;
// - resizing: the edges being dragged line up with other boxes.

export type Box = { x: number; y: number; w: number; h: number };

export type Guide = {
  kind: "align" | "gap";
  orientation: "vertical" | "horizontal"; // direction the guide line runs
  pos: number; // x of a vertical line, y of a horizontal one
  from: number; // extent along the line
  to: number;
  label?: string; // gap size, for spacing markers
};

type Axis = "x" | "y";
type Line = { pos: number; from: number; to: number };

const ALIGNED_EPSILON = 0.5;

const startOf = (b: Box, axis: Axis) => (axis === "x" ? b.x : b.y);
const sizeOf = (b: Box, axis: Axis) => (axis === "x" ? b.w : b.h);
const endOf = (b: Box, axis: Axis) => startOf(b, axis) + sizeOf(b, axis);
const centerOf = (b: Box, axis: Axis) => startOf(b, axis) + sizeOf(b, axis) / 2;
const other = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
const shift = (b: Box, axis: Axis, d: number): Box => (axis === "x" ? { ...b, x: b.x + d } : { ...b, y: b.y + d });

/** Left/centre/right (axis x) or top/middle/bottom (axis y) lines of a box */
const linesOf = (b: Box, axis: Axis): Line[] =>
  [startOf(b, axis), centerOf(b, axis), endOf(b, axis)].map((pos) => ({
    pos,
    from: startOf(b, other(axis)),
    to: endOf(b, other(axis)),
  }));

const pageLine = (page: { width: number; height: number }, axis: Axis): Line =>
  axis === "x" ? { pos: page.width / 2, from: 0, to: page.height } : { pos: page.height / 2, from: 0, to: page.width };

/** Smallest correction (within threshold) that puts one of `moving` on one of `targets`. */
function bestOffset(moving: number[], targets: number[], threshold: number) {
  let best: number | null = null;
  for (const m of moving) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

function alignGuides(moving: Line[], targets: Line[], axis: Axis): Guide[] {
  const byPos = new Map<number, Guide>();
  for (const m of moving) {
    for (const t of targets) {
      if (Math.abs(t.pos - m.pos) > ALIGNED_EPSILON) continue;
      const key = Math.round(t.pos * 2) / 2;
      const existing = byPos.get(key);
      byPos.set(key, {
        kind: "align",
        orientation: axis === "x" ? "vertical" : "horizontal",
        pos: t.pos,
        from: Math.min(m.from, t.from, existing?.from ?? Infinity),
        to: Math.max(m.to, t.to, existing?.to ?? -Infinity),
      });
    }
  }
  return [...byPos.values()];
}

// ---- Equal spacing ----

const overlapsAcross = (a: Box, b: Box, axis: Axis) =>
  startOf(a, other(axis)) < endOf(b, other(axis)) && startOf(b, other(axis)) < endOf(a, other(axis));

/** Boxes sharing the row (axis x) or column (axis y) with `box`, and its nearest neighbours. */
function rowOf(box: Box, others: Box[], axis: Axis, threshold: number) {
  const row = others.filter((o) => overlapsAcross(o, box, axis));
  const before = row
    .filter((o) => centerOf(o, axis) < centerOf(box, axis) && endOf(o, axis) <= startOf(box, axis) + threshold)
    .sort((a, b) => endOf(b, axis) - endOf(a, axis))[0];
  const after = row
    .filter((o) => centerOf(o, axis) > centerOf(box, axis) && startOf(o, axis) >= endOf(box, axis) - threshold)
    .sort((a, b) => startOf(a, axis) - startOf(b, axis))[0];
  // Gaps already used between neighbouring boxes of the row
  const sorted = [...row].sort((a, b) => startOf(a, axis) - startOf(b, axis));
  const gaps: { gap: number; a: Box; b: Box }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = startOf(sorted[i], axis) - endOf(sorted[i - 1], axis);
    if (gap > ALIGNED_EPSILON) gaps.push({ gap, a: sorted[i - 1], b: sorted[i] });
  }
  return { before, after, gaps };
}

/** Positions (start along axis) where the box would be evenly spaced */
function gapTargets(box: Box, others: Box[], axis: Axis, threshold: number) {
  const { before, after, gaps } = rowOf(box, others, axis, threshold);
  const targets: number[] = [];
  if (before && after) targets.push((endOf(before, axis) + startOf(after, axis) - sizeOf(box, axis)) / 2);
  for (const { gap } of gaps) {
    if (before) targets.push(endOf(before, axis) + gap);
    if (after) targets.push(startOf(after, axis) - gap - sizeOf(box, axis));
  }
  return targets;
}

function gapMarker(a: Box, b: Box, axis: Axis): Guide {
  // Drawn across the gap between a (before) and b (after), midway through their overlap
  const from = endOf(a, axis);
  const to = startOf(b, axis);
  const lo = Math.max(startOf(a, other(axis)), startOf(b, other(axis)));
  const hi = Math.min(endOf(a, other(axis)), endOf(b, other(axis)));
  return {
    kind: "gap",
    orientation: axis === "x" ? "horizontal" : "vertical",
    pos: (lo + hi) / 2,
    from,
    to,
    label: String(Math.round(to - from)),
  };
}

function gapGuides(box: Box, others: Box[], axis: Axis): Guide[] {
  const { before, after, gaps } = rowOf(box, others, axis, ALIGNED_EPSILON);
  const gapBefore = before ? startOf(box, axis) - endOf(before, axis) : null;
  const gapAfter = after ? startOf(after, axis) - endOf(box, axis) : null;
  const markers: Guide[] = [];
  const same = (a: number | null, b: number | null) => a !== null && b !== null && a > 0 && Math.abs(a - b) < ALIGNED_EPSILON;

  if (same(gapBefore, gapAfter)) markers.push(gapMarker(before!, box, axis), gapMarker(box, after!, axis));
  for (const g of gaps) {
    if (same(gapBefore, g.gap)) markers.push(gapMarker(before!, box, axis), gapMarker(g.a, g.b, axis));
    else if (same(gapAfter, g.gap)) markers.push(gapMarker(box, after!, axis), gapMarker(g.a, g.b, axis));
  }
  const seen = new Set<string>();
  return markers.filter((m) => {
    const key = `${m.orientation}${Math.round(m.pos)}:${Math.round(m.from)}-${Math.round(m.to)}`;
    return !seen.has(key) && (seen.add(key), true);
  });
}

// ---- Public API ----

/** Snap a box being moved. */
export function snapBox(
  box: Box,
  others: Box[],
  page: { width: number; height: number },
  threshold: number,
  { spacing = true }: { spacing?: boolean } = {}
) {
  let snapped = box;
  for (const axis of ["x", "y"] as Axis[]) {
    const alignTargets = [...others.flatMap((o) => linesOf(o, axis)), pageLine(page, axis)].map((l) => l.pos);
    const align = bestOffset(linesOf(snapped, axis).map((l) => l.pos), alignTargets, threshold);
    const gap = spacing
      ? bestOffset([startOf(snapped, axis)], gapTargets(snapped, others, axis, threshold), threshold)
      : null;
    const offset = [align, gap].filter((d): d is number => d !== null).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    if (offset) snapped = shift(snapped, axis, offset);
  }

  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as Axis[]) {
    guides.push(
      ...alignGuides(linesOf(snapped, axis), [...others.flatMap((o) => linesOf(o, axis)), pageLine(page, axis)], axis),
      ...(spacing ? gapGuides(snapped, others, axis) : [])
    );
  }
  return { x: snapped.x, y: snapped.y, guides };
}

export type ResizeEdges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };

/**
 * Snap the dragged edges of a box being resized. With `aspect` (w/h) the horizontal edge leads
 * and the height follows, keeping the opposite corner fixed.
 */
export function snapResize(
  box: Box,
  edges: ResizeEdges,
  others: Box[],
  page: { width: number; height: number },
  threshold: number,
  aspect?: number
) {
  let { x, y, w, h } = box;
  const snapEdge = (pos: number, axis: Axis) => {
    const targets = [...others.flatMap((o) => linesOf(o, axis)), pageLine(page, axis)].map((l) => l.pos);
    return bestOffset([pos], targets, threshold) ?? 0;
  };

  if (edges.left) {
    const d = snapEdge(x, "x");
    x += d;
    w -= d;
  } else if (edges.right) {
    w += snapEdge(x + w, "x");
  }

  if (aspect) {
    const newH = w / aspect;
    if (edges.top) y += h - newH;
    h = newH;
  } else if (edges.top) {
    const d = snapEdge(y, "y");
    y += d;
    h -= d;
  } else if (edges.bottom) {
    h += snapEdge(y + h, "y");
  }

  const snapped = { x, y, w, h };
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as Axis[]) {
    const moving = linesOf(snapped, axis).filter((_, i) =>
      axis === "x" ? (i === 0 && edges.left) || (i === 2 && edges.right) : (i === 0 && edges.top) || (i === 2 && edges.bottom)
    );
    guides.push(...alignGuides(moving, [...others.flatMap((o) => linesOf(o, axis)), pageLine(page, axis)], axis));
  }
  return { ...snapped, guides };
}

/** Snap a single point (a line's end) to other boxes' edges and centres. */
export function snapPoint(p: { x: number; y: number }, others: Box[], page: { width: number; height: number }, threshold: number) {
  // Equal spacing doesn't make sense for a point
  return snapBox({ x: p.x, y: p.y, w: 0, h: 0 }, others, page, threshold, { spacing: false });
}
