"use client";

import React from "react";
import {
  FILL_COLORS,
  HIGHLIGHT_COLORS,
  REDACT_COLORS,
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
import { useI18n } from "@/i18n/client";
import { format } from "@/i18n/config";

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
  const { t } = useI18n();
  const tb = t.toolbar;
  const hasStroke = kind === "rect" || kind === "ellipse" || kind === "line" || kind === "check" || kind === "cross";

  return (
    <ToolbarShell>
      {kind === "whiteout" && (
        <>
          <span
            className="px-1 text-[11px] text-slate-500"
            title={tb.coverHint}
          >
            {tb.cover}
          </span>
          <ColorSwatches
            colors={FILL_COLORS}
            value={style.fill}
            onChange={(fill) => fill && onChange({ fill, stroke: fill })}
            title={tb.coverColor}
          />
          <ToolbarDivider />
        </>
      )}

      {kind === "redact" && (
        <>
          <span className="px-1 text-[11px] font-semibold text-red-600" title={tb.redactHint}>
            {tb.redact}
          </span>
          <ColorSwatches
            colors={REDACT_COLORS}
            value={style.fill}
            onChange={(fill) => fill && onChange({ fill, stroke: fill })}
            title={tb.redactColor}
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
            title={tb.highlightColor}
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
            title={tb.lineColor}
          />
          <ToolbarDivider />
          {STROKE_WIDTHS.map((w) => (
            <ToolbarIconButton
              key={w}
              active={style.strokeWidth === w}
              title={format(tb.thickness, { width: w })}
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
          <span className="px-1 text-[11px] text-slate-500">{tb.fill}</span>
          <ColorSwatches
            colors={FILL_COLORS}
            value={style.fill}
            onChange={(fill) => onChange({ fill })}
            allowNone
            title={tb.fillColor}
          />
          <ToolbarDivider />
        </>
      )}

      <ToolbarDeleteButton onDelete={onDelete} />
    </ToolbarShell>
  );
}
