"use client";

import React from "react";
import {
  FILL_COLORS,
  HIGHLIGHT_COLORS,
  STROKE_COLORS,
  STROKE_WIDTHS,
  type ShapeKind,
  type ShapeStyle,
} from "@/lib/shapes";
import {
  ColorSwatches,
  ToolbarDeleteButton,
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarShell,
} from "@/components/FloatingToolbar";

export default function ShapeToolbar({
  kind,
  style,
  onChange,
  onDelete,
}: {
  kind: ShapeKind;
  style: ShapeStyle;
  onChange: (updates: Partial<ShapeStyle>) => void;
  onDelete: () => void;
}) {
  const hasStroke = kind === "rect" || kind === "ellipse" || kind === "line" || kind === "check" || kind === "cross";

  return (
    <ToolbarShell>
      {kind === "whiteout" && (
        <>
          <span
            className="px-1 text-[11px] text-slate-500"
            title="Whiteout only covers content visually: the original text is still inside the PDF and can be copied or extracted."
          >
            Cover
          </span>
          <ColorSwatches
            colors={FILL_COLORS}
            value={style.fill}
            onChange={(fill) => fill && onChange({ fill, stroke: fill })}
            title="Cover color"
          />
          <ToolbarDivider />
        </>
      )}

      {kind === "highlight" && (
        <>
          <ColorSwatches
            colors={HIGHLIGHT_COLORS}
            value={style.fill}
            onChange={(fill) => fill && onChange({ fill, stroke: fill })}
            title="Highlight color"
          />
          <ToolbarDivider />
        </>
      )}

      {hasStroke && (
        <>
          <ColorSwatches
            colors={STROKE_COLORS}
            value={style.stroke}
            onChange={(stroke) => stroke && onChange({ stroke })}
            title="Line color"
          />
          <ToolbarDivider />
          {STROKE_WIDTHS.map((w) => (
            <ToolbarIconButton
              key={w}
              active={style.strokeWidth === w}
              title={`Thickness ${w} pt`}
              onClick={() => onChange({ strokeWidth: w })}
            >
              <span className="block w-4 rounded-full bg-current" style={{ height: Math.max(1, w * 0.8) }} />
            </ToolbarIconButton>
          ))}
          <ToolbarDivider />
        </>
      )}

      {(kind === "rect" || kind === "ellipse") && (
        <>
          <span className="px-1 text-[11px] text-slate-500">Fill</span>
          <ColorSwatches
            colors={FILL_COLORS}
            value={style.fill}
            onChange={(fill) => onChange({ fill })}
            allowNone
            title="Fill color"
          />
          <ToolbarDivider />
        </>
      )}

      <ToolbarDeleteButton onDelete={onDelete} />
    </ToolbarShell>
  );
}
