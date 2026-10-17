"use client";

import React, { useEffect, useRef } from "react";
import { pdfjsLib } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";
import PdfPageCanvas from "@/components/PdfPageCanvas";
import { useI18n } from "@/i18n/client";
import { format, plural } from "@/i18n/config";

export const THUMBNAIL_SIDEBAR_WIDTH = 160; // px, matches w-40
const THUMB_WIDTH = 112;
const EDGE_MARGIN = 16;

export default function PageThumbnails({
  pdfDoc,
  pageSizes,
  currentPage,
  editCounts,
  onSelect,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageSizes: { width: number; height: number }[];
  currentPage: number;
  editCounts: number[]; // per page: annotations + filled form fields
  onSelect: (page: number) => void;
}) {
  const { t } = useI18n();
  const tt = t.thumbnails;
  const editsLabel = (n: number) => plural(n, tt.editsOne, tt.editsOther);
  const containerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the current page's thumbnail in view. Scrolls only this panel (scrollIntoView would also
  // scroll the window and the main editor).
  useEffect(() => {
    const container = containerRef.current;
    const item = itemRefs.current[currentPage - 1];
    if (!container || !item) return;
    const top = item.offsetTop - EDGE_MARGIN;
    const bottom = item.offsetTop + item.offsetHeight + EDGE_MARGIN;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [currentPage]);

  return (
    <nav
      ref={containerRef}
      aria-label={tt.pages}
      data-scroll-root
      className="hide-scrollbar relative flex h-full w-40 shrink-0 flex-col items-center gap-4 overflow-y-auto border-r border-slate-200 bg-white/60 px-4 pb-24 pt-6 dark:border-slate-800 dark:bg-slate-900/60"
    >
      {pdfDoc &&
        pageSizes.map((size, i) => {
          const page = i + 1;
          const isCurrent = page === currentPage;
          const thumbScale = THUMB_WIDTH / size.width;
          return (
            <button
              key={page}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              onClick={() => onSelect(page)}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={
                editCounts[i]
                  ? format(tt.pageWithEdits, { n: page, edits: editsLabel(editCounts[i]) })
                  : format(t.common.page, { n: page })
              }
              className="group flex shrink-0 flex-col items-center gap-1.5 outline-none"
            >
              <div
                className={cn(
                  "relative overflow-hidden bg-white shadow-sm transition-shadow",
                  isCurrent
                    ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
                    : "ring-1 ring-slate-200 group-hover:ring-slate-400 group-focus-visible:ring-2 group-focus-visible:ring-blue-400 dark:ring-slate-700"
                )}
                style={{ width: THUMB_WIDTH, height: size.height * thumbScale }}
              >
                <PdfPageCanvas pdfDoc={pdfDoc} pageNumber={page} scale={thumbScale} hideFormWidgets={false} />
                {editCounts[i] > 0 && (
                  <span
                    title={format(tt.editsOnPage, { edits: editsLabel(editCounts[i]) })}
                    className="absolute right-1 top-1 min-w-[1.25rem] rounded-full bg-blue-600 px-1.5 text-center text-[10px] font-semibold leading-5 text-white shadow"
                  >
                    {editCounts[i]}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isCurrent ? "font-semibold text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {page}
              </span>
            </button>
          );
        })}
    </nav>
  );
}
