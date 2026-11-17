"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutGrid, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { categoryIconClass, toolIcons } from "@/lib/toolIcons";
import { toolCategories, toolCategoryIds, toolPath, type ToolId } from "@/lib/tools";

/**
 * "All tools" button that opens a full-width panel under the header with every tool grouped
 * by category, replacing the row of tool tabs. Closes on outside click, Escape, or navigation.
 */
export default function ToolsMenu({ current }: Readonly<{ current: ToolId }>) {
  const { t, locale } = useI18n();
  const h = t.home;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="tools-menu"
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border px-3 text-[15px] font-medium transition-colors",
          open ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-ink"
        )}
      >
        {open ? <X className="h-[18px] w-[18px]" aria-hidden="true" /> : <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />}
        <span>{h.menu.tools}</span>
        <ChevronDown className={cn("hidden h-4 w-4 transition-transform sm:block", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="tools-menu"
          className="absolute inset-x-0 top-full z-[100] max-h-[calc(100dvh-80px)] overflow-y-auto border-b border-line bg-paper shadow-[0_24px_48px_-24px_rgba(21,23,28,0.35)]"
        >
          <nav
            aria-label={h.menu.tools}
            className="mx-auto grid w-full max-w-[1200px] gap-x-8 gap-y-6 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4"
          >
            {toolCategoryIds.map((cat) => (
              <section key={cat} className="flex flex-col gap-2">
                <h2 className="px-2 font-mono text-xs tracking-[0.04em] text-muted uppercase">{h.categories[cat]}</h2>
                <ul className="flex flex-col gap-1">
                  {toolCategories[cat].map((id) => {
                    const Icon = toolIcons[id];
                    const active = id === current;
                    return (
                      <li key={id}>
                        <Link
                          href={toolPath(id, locale)}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-start gap-3 rounded-[10px] p-2 text-ink transition-colors",
                            active ? "bg-marker/35" : "hover:bg-surface"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              categoryIconClass[cat]
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[15px] font-semibold">{t.tools[id].label}</span>
                            <span className="text-[13px] leading-snug text-muted">{h.toolBlurbs[id]}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
