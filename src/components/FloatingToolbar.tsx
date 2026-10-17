"use client";

import React from "react";
import { Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

// Building blocks for the small toolbars that float above a selected annotation.

export function ToolbarShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg"
      onMouseDown={(e) => {
        // Don't start a drag of the box; keep textarea focus when pressing buttons
        e.stopPropagation();
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ToolbarIconButton({
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
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-md px-1 transition-colors",
        active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
      )}
    >
      {children}
    </button>
  );
}

export const ToolbarDivider = () => <div className="mx-0.5 h-5 w-px bg-slate-200" />;

export function ColorSwatches({
  colors,
  value,
  onChange,
  allowNone,
  title,
}: {
  colors: readonly string[];
  value: string | null;
  onChange: (color: string | null) => void;
  allowNone?: boolean;
  title?: string;
}) {
  const { t } = useI18n();
  const current = value?.toLowerCase() ?? null;
  return (
    <div className="flex items-center gap-0.5" title={title ?? t.toolbar.color}>
      {allowNone && (
        <button
          type="button"
          title={t.toolbar.none}
          aria-label={t.toolbar.none}
          onClick={() => onChange(null)}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-slate-400",
            current === null && "ring-2 ring-blue-500 ring-offset-1"
          )}
        >
          <Ban className="h-3 w-3" />
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={cn(
            "h-4 w-4 rounded-full border border-slate-300",
            current === c && "ring-2 ring-blue-500 ring-offset-1"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        title={t.toolbar.customColor}
        className={cn(
          "relative ml-0.5 h-4 w-4 cursor-pointer overflow-hidden rounded-full border border-slate-300",
          current !== null && !colors.includes(current) && "ring-2 ring-blue-500 ring-offset-1"
        )}
        style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
      >
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export function ToolbarDeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onDelete}
      title={t.toolbar.delete}
      aria-label={t.toolbar.delete}
      className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
