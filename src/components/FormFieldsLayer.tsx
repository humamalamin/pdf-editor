"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { OFF, fieldFontSize, type FormField, type FormValues } from "@/lib/forms";

/**
 * Interactive HTML controls laid over a page's AcroForm widgets. While a drawing/text tool is
 * active the layer lets clicks through, so marks can be placed on top of fields too.
 */
export default function FormFieldsLayer({
  fields,
  values,
  scale,
  highlight,
  inactive,
  onChange,
}: {
  fields: FormField[];
  values: FormValues;
  scale: number;
  highlight: boolean;
  inactive: boolean;
  onChange: (name: string, value: string) => void;
}) {
  return (
    // The layer itself never takes the pointer, so the PDF text underneath stays selectable;
    // only the field controls do (and not while a drawing tool is active).
    <div className="pointer-events-none absolute inset-0">
      {fields.map((f) => {
        const value = values[f.name] ?? "";
        const box: React.CSSProperties = {
          left: f.x * scale,
          top: f.y * scale,
          width: f.width * scale,
          height: f.height * scale,
          border: f.borderWidth ? `${f.borderWidth * scale}px solid ${f.borderColor}` : undefined,
          backgroundColor: f.backgroundColor ?? undefined,
          // Highlight tint layered over the field's own background
          backgroundImage: highlight && !f.readOnly ? "linear-gradient(rgb(59 130 246 / 0.12), rgb(59 130 246 / 0.12))" : undefined,
        };
        const surface = cn(
          "pdf-annotation absolute outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
          !inactive && "pointer-events-auto",
          !f.readOnly && "hover:brightness-95",
          f.readOnly && "cursor-not-allowed"
        );
        const stop = {
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
          onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        };

        if (f.kind === "checkbox" || f.kind === "radio") {
          const checked = value === f.onValue;
          const toggle = () => {
            if (f.readOnly) return;
            if (f.kind === "checkbox") onChange(f.name, checked ? OFF : f.onValue);
            else if (!checked) onChange(f.name, f.onValue);
          };
          return (
            <button
              key={f.id}
              type="button"
              role={f.kind}
              aria-checked={checked}
              aria-label={f.name}
              title={f.name}
              disabled={f.readOnly}
              style={box}
              className={cn(surface, "flex items-center justify-center", f.kind === "radio" && "rounded-full")}
              {...stop}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              {checked &&
                (f.kind === "checkbox" ? (
                  <Check className="h-[80%] w-[80%] text-black" strokeWidth={3} />
                ) : (
                  <span className="h-[50%] w-[50%] rounded-full bg-black" />
                ))}
            </button>
          );
        }

        const textStyle: React.CSSProperties = {
          ...box,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: fieldFontSize(f) * scale,
          lineHeight: 1.15,
          textAlign: f.align,
          padding: `0 ${2 * scale}px`,
          color: "black",
        };

        if (f.kind === "select") {
          return (
            <select
              key={f.id}
              aria-label={f.name}
              title={f.name}
              value={value}
              disabled={f.readOnly}
              onChange={(e) => onChange(f.name, e.target.value)}
              style={textStyle}
              className={cn(surface, "appearance-auto")}
              {...stop}
            >
              {!f.options.some((o) => o.value === value) && <option value={value}>{value}</option>}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }

        const common = {
          "aria-label": f.name,
          title: f.name,
          value,
          readOnly: f.readOnly,
          maxLength: f.maxLength ?? undefined,
          style: textStyle,
          className: cn(surface, "hide-scrollbar resize-none"),
          ...stop,
        };
        return f.multiline ? (
          <textarea
            key={f.id}
            {...common}
            style={{ ...textStyle, paddingTop: 2 * scale }}
            onChange={(e) => onChange(f.name, e.target.value)}
          />
        ) : (
          <input
            key={f.id}
            {...common}
            type={f.password ? "password" : "text"}
            onChange={(e) => onChange(f.name, e.target.value)}
          />
        );
      })}
    </div>
  );
}
