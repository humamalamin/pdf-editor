"use client";

import { useRef, type ReactNode } from "react";
import { Info, X } from "lucide-react";

// Native <dialog> keeps the content in the server-rendered HTML for crawlers
// while giving Esc-to-close, focus trapping and a backdrop for free.
export default function ToolInfoDialog({
  label,
  closeLabel,
  children,
}: Readonly<{ label: string; closeLabel: string; children: ReactNode }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={label}
        onClick={(e) => {
          // Clicks on the backdrop land on the <dialog> element itself.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-300"
      >
        <div className="relative max-h-[85dvh] overflow-y-auto px-6 py-8 sm:px-8">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={closeLabel}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* Sole child of its own wrapper: server-rendered children placed beside the button
              are reconciled as a list and trip React's dev-only missing-key warning. */}
          <div>{children}</div>
        </div>
      </dialog>
    </>
  );
}
