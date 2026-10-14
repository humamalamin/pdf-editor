"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { styleOf, type Annotation } from "@/lib/annotations";
import { SYMBOL_BOX, SYMBOL_PATHS } from "@/lib/shapes";

/** Visual of a box-shaped shape, filling its (Rnd) container. Geometry matches the PDF export. */
export function ShapeBody({ ann, scale }: { ann: Annotation; scale: number }) {
  const kind = ann.shape ?? "rect";
  const style = styleOf(ann);
  const w = (ann.width ?? 0) * scale;
  const h = (ann.height ?? 0) * scale;
  const sw = style.strokeWidth * scale;

  if (kind === "whiteout" || kind === "highlight") {
    return <div className="h-full w-full" style={{ backgroundColor: style.fill ?? style.stroke, opacity: style.opacity }} />;
  }

  if (kind === "check" || kind === "cross") {
    return (
      <svg viewBox={`0 0 ${SYMBOL_BOX} ${SYMBOL_BOX}`} className="block h-full w-full overflow-visible">
        <path
          d={SYMBOL_PATHS[kind]}
          fill="none"
          stroke={style.stroke}
          strokeWidth={(style.strokeWidth * SYMBOL_BOX) / (ann.width || SYMBOL_BOX)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={style.opacity}
        />
      </svg>
    );
  }

  const common = {
    stroke: style.stroke,
    strokeWidth: sw,
    fill: style.fill ?? "none",
    opacity: style.opacity,
  };
  return (
    <svg width={w} height={h} className="block overflow-visible">
      {kind === "ellipse" ? (
        <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, (w - sw) / 2)} ry={Math.max(0, (h - sw) / 2)} {...common} />
      ) : (
        <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} {...common} />
      )}
    </svg>
  );
}

const HIT_PADDING = 8; // px of grab area around a thin line
const SNAP_ANGLE = Math.PI / 4;

/** Constrains (dx, dy) to the nearest 45° direction, keeping its length. */
export function snapToAngle(dx: number, dy: number) {
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE;
  return { dx: Math.cos(angle) * length, dy: Math.sin(angle) * length };
}

export type LineChangeInfo = { mode: "move" | "start" | "end"; altKey: boolean; shiftKey: boolean };

type Drag = { mode: "move" | "start" | "end"; pointerX: number; pointerY: number; origin: Annotation; moved: boolean };

/**
 * A line annotation: drag the line to move it, drag either end handle to reshape it
 * (hold Shift to snap to 45° steps). Coordinates are clamped to the page.
 */
export function LineShape({
  ann,
  scale,
  pageWidth,
  pageHeight,
  isSelected,
  isOnlySelected,
  onPress,
  onClickLine,
  onBeforeChange,
  onChange,
  onInteractionEnd,
  toolbar,
}: {
  ann: Annotation;
  scale: number;
  pageWidth: number; // PDF points
  pageHeight: number;
  isSelected: boolean; // highlighted (alone or as part of a group)
  isOnlySelected: boolean; // the lone selection: shows end handles and the toolbar
  onPress: (e: React.PointerEvent) => void;
  onClickLine: (e: React.MouseEvent) => void;
  onBeforeChange: () => void; // called once when a drag actually starts changing the line
  onChange: (updates: Partial<Annotation>, info: LineChangeInfo) => void;
  onInteractionEnd: () => void;
  toolbar?: React.ReactNode;
}) {
  const drag = useRef<Drag | null>(null);
  const style = styleOf(ann);
  const x1 = ann.x;
  const y1 = ann.y;
  const x2 = ann.x2 ?? ann.x;
  const y2 = ann.y2 ?? ann.y;
  const clampX = (v: number) => Math.min(pageWidth, Math.max(0, v));
  const clampY = (v: number) => Math.min(pageHeight, Math.max(0, v));

  const left = Math.min(x1, x2) * scale - HIT_PADDING;
  const top = Math.min(y1, y2) * scale - HIT_PADDING;
  const width = Math.abs(x2 - x1) * scale + HIT_PADDING * 2;
  const height = Math.abs(y2 - y1) * scale + HIT_PADDING * 2;
  // Endpoints in the local SVG coordinate space
  const p1 = { x: x1 * scale - left, y: y1 * scale - top };
  const p2 = { x: x2 * scale - left, y: y2 * scale - top };

  const startDrag = (mode: Drag["mode"]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onPress(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, pointerX: e.clientX, pointerY: e.clientY, origin: ann, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.pointerX) / scale;
    const dy = (e.clientY - d.pointerY) / scale;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * scale < 2) return;
      d.moved = true;
      onBeforeChange();
    }
    const o = { x1: d.origin.x, y1: d.origin.y, x2: d.origin.x2 ?? d.origin.x, y2: d.origin.y2 ?? d.origin.y };
    const info: LineChangeInfo = { mode: d.mode, altKey: e.altKey, shiftKey: e.shiftKey };

    if (d.mode === "move") {
      // Clamp the whole line so neither end leaves the page
      const mx = Math.min(pageWidth - Math.max(o.x1, o.x2), Math.max(-Math.min(o.x1, o.x2), dx));
      const my = Math.min(pageHeight - Math.max(o.y1, o.y2), Math.max(-Math.min(o.y1, o.y2), dy));
      onChange({ x: o.x1 + mx, y: o.y1 + my, x2: o.x2 + mx, y2: o.y2 + my }, info);
      return;
    }

    const [fixedX, fixedY, movingX, movingY] =
      d.mode === "start" ? [o.x2, o.y2, o.x1 + dx, o.y1 + dy] : [o.x1, o.y1, o.x2 + dx, o.y2 + dy];
    let vx = movingX - fixedX;
    let vy = movingY - fixedY;
    if (e.shiftKey) ({ dx: vx, dy: vy } = snapToAngle(vx, vy));
    const nx = clampX(fixedX + vx);
    const ny = clampY(fixedY + vy);
    onChange(d.mode === "start" ? { x: nx, y: ny } : { x2: nx, y2: ny }, info);
  };

  const onPointerUp = () => {
    if (drag.current?.moved) onInteractionEnd();
    drag.current = null;
  };

  const handle = (p: { x: number; y: number }, mode: "start" | "end") => (
    <div
      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none"
      style={{ left: p.x, top: p.y }}
      onPointerDown={startDrag(mode)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow" />
    </div>
  );

  return (
    <div
      className={cn("pdf-annotation pointer-events-none absolute", isSelected ? "z-20" : "z-10")}
      style={{ left, top, width, height }}
      data-ann-id={ann.id}
      onClick={onClickLine}
    >
      <svg width={width} height={height} className="block overflow-visible">
        {isSelected && (
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3b82f6" strokeWidth={style.strokeWidth * scale + 6} strokeOpacity={0.25} strokeLinecap="round" />
        )}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth * scale}
          strokeLinecap="round"
          opacity={style.opacity}
        />
        {/* Wide invisible stroke = comfortable grab area for thin lines */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="transparent"
          strokeWidth={HIT_PADDING * 2}
          strokeLinecap="round"
          className="pointer-events-auto cursor-move touch-none"
          onPointerDown={startDrag("move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </svg>
      {isOnlySelected && (
        <div className="pointer-events-auto">
          {handle(p1, "start")}
          {handle(p2, "end")}
        </div>
      )}
      {isOnlySelected && toolbar && (
        <div
          className={cn(
            "pointer-events-auto absolute z-30",
            top < 52 ? "top-full mt-1" : "bottom-full mb-1",
            left > (pageWidth * scale) / 2 ? "right-0" : "left-0"
          )}
        >
          {toolbar}
        </div>
      )}
    </div>
  );
}
