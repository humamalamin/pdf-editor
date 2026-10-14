"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Minus, Plus } from "lucide-react";
import { FONTS, type FontKey, type TextAlign, type TextFormat } from "@/lib/editorFonts";
import {
  ColorSwatches,
  ToolbarDeleteButton,
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarShell,
} from "@/components/FloatingToolbar";

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const MIN_SIZE = 6;
const MAX_SIZE = 200;
const TEXT_COLORS = ["#000000", "#475569", "#dc2626", "#2563eb", "#16a34a", "#ffffff"];

const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));

export default function TextToolbar({
  format,
  onChange,
  onDelete,
}: {
  format?: TextFormat; // undefined for image annotations: only Delete is shown
  onChange: (updates: Partial<TextFormat>) => void;
  onDelete: () => void;
}) {
  const [sizeDraft, setSizeDraft] = React.useState<string | null>(null);

  const commitSize = () => {
    const n = Number(sizeDraft);
    if (sizeDraft !== null && Number.isFinite(n) && n > 0) onChange({ fontSize: clampSize(n) });
    setSizeDraft(null);
  };

  const alignOptions: { value: TextAlign; icon: React.ReactNode; title: string }[] = [
    { value: "left", icon: <AlignLeft className="h-4 w-4" />, title: "Align left" },
    { value: "center", icon: <AlignCenter className="h-4 w-4" />, title: "Align center" },
    { value: "right", icon: <AlignRight className="h-4 w-4" />, title: "Align right" },
  ];

  return (
    <ToolbarShell>
      {format && (
        <>
          <select
            value={format.fontFamily}
            onChange={(e) => onChange({ fontFamily: e.target.value as FontKey })}
            title="Font"
            className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs outline-none hover:bg-slate-50 focus:border-blue-400"
          >
            {(Object.keys(FONTS) as FontKey[]).map((key) => (
              <option key={key} value={key} style={{ fontFamily: `"${FONTS[key].css}"` }}>
                {FONTS[key].label}
              </option>
            ))}
          </select>

          <div className="flex items-center">
            <ToolbarIconButton title="Decrease font size" onClick={() => onChange({ fontSize: clampSize(format.fontSize - 1) })}>
              <Minus className="h-3.5 w-3.5" />
            </ToolbarIconButton>
            <input
              list="pdf-editor-font-sizes"
              inputMode="numeric"
              title="Font size (pt)"
              value={sizeDraft ?? String(format.fontSize)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setSizeDraft(e.target.value);
                // Picking from the datalist applies immediately
                if (FONT_SIZES.includes(Number(e.target.value))) {
                  onChange({ fontSize: Number(e.target.value) });
                  setSizeDraft(null);
                }
              }}
              onBlur={commitSize}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setSizeDraft(null);
                  e.currentTarget.blur();
                }
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  onChange({ fontSize: clampSize(format.fontSize + (e.key === "ArrowUp" ? 1 : -1)) });
                }
              }}
              className="h-7 w-10 rounded-md border border-slate-200 text-center text-xs outline-none focus:border-blue-400"
            />
            <datalist id="pdf-editor-font-sizes">
              {FONT_SIZES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <ToolbarIconButton title="Increase font size" onClick={() => onChange({ fontSize: clampSize(format.fontSize + 1) })}>
              <Plus className="h-3.5 w-3.5" />
            </ToolbarIconButton>
          </div>

          <ToolbarDivider />

          <ToolbarIconButton active={format.bold} title="Bold (Ctrl+B)" onClick={() => onChange({ bold: !format.bold })}>
            <Bold className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton active={format.italic} title="Italic (Ctrl+I)" onClick={() => onChange({ italic: !format.italic })}>
            <Italic className="h-4 w-4" />
          </ToolbarIconButton>

          <ToolbarDivider />

          <ColorSwatches
            colors={TEXT_COLORS}
            value={format.color}
            onChange={(color) => color && onChange({ color })}
            title="Text color"
          />

          <ToolbarDivider />

          {alignOptions.map((opt) => (
            <ToolbarIconButton
              key={opt.value}
              active={format.align === opt.value}
              title={opt.title}
              onClick={() => onChange({ align: opt.value })}
            >
              {opt.icon}
            </ToolbarIconButton>
          ))}

          <ToolbarDivider />
        </>
      )}

      <ToolbarDeleteButton onDelete={onDelete} />
    </ToolbarShell>
  );
}
