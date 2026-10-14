"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FONTS, type FontKey, type TextAlign, type TextFormat } from "@/lib/editorFonts";

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const MIN_SIZE = 6;
const MAX_SIZE = 200;
const SWATCHES = ["#000000", "#475569", "#dc2626", "#2563eb", "#16a34a", "#ffffff"];

const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));

function IconButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="mx-0.5 h-5 w-px bg-slate-200" />;

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
    <div
      className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg"
      onMouseDown={(e) => {
        // Don't start a drag of the box; keep textarea focus when pressing buttons
        e.stopPropagation();
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
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
            <IconButton title="Decrease font size" onClick={() => onChange({ fontSize: clampSize(format.fontSize - 1) })}>
              <Minus className="h-3.5 w-3.5" />
            </IconButton>
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
            <IconButton title="Increase font size" onClick={() => onChange({ fontSize: clampSize(format.fontSize + 1) })}>
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
          </div>

          <Divider />

          <IconButton active={format.bold} title="Bold (Ctrl+B)" onClick={() => onChange({ bold: !format.bold })}>
            <Bold className="h-4 w-4" />
          </IconButton>
          <IconButton active={format.italic} title="Italic (Ctrl+I)" onClick={() => onChange({ italic: !format.italic })}>
            <Italic className="h-4 w-4" />
          </IconButton>

          <Divider />

          <div className="flex items-center gap-0.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => onChange({ color: c })}
                className={cn(
                  "h-4 w-4 rounded-full border border-slate-300",
                  format.color.toLowerCase() === c && "ring-2 ring-blue-500 ring-offset-1"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              title="Custom color"
              className={cn(
                "relative ml-0.5 h-4 w-4 cursor-pointer overflow-hidden rounded-full border border-slate-300",
                !SWATCHES.includes(format.color.toLowerCase()) && "ring-2 ring-blue-500 ring-offset-1"
              )}
              style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
            >
              <input
                type="color"
                value={format.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>

          <Divider />

          {alignOptions.map((opt) => (
            <IconButton
              key={opt.value}
              active={format.align === opt.value}
              title={opt.title}
              onClick={() => onChange({ align: opt.value })}
            >
              {opt.icon}
            </IconButton>
          ))}

          <Divider />
        </>
      )}

      <button
        type="button"
        onClick={onDelete}
        title="Delete (Del)"
        className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
