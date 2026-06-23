"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { PenTool, Combine, Scissors, Layout, Minimize2 } from "lucide-react";

const PdfEditor = dynamic(() => import("@/components/PdfEditor"), { ssr: false });
const PdfMerge = dynamic(() => import("@/components/PdfMerge"), { ssr: false });
const PdfSplit = dynamic(() => import("@/components/PdfSplit"), { ssr: false });
const PdfOrganizer = dynamic(() => import("@/components/PdfOrganizer"), {
  ssr: false,
});
const PdfCompress = dynamic(() => import("@/components/PdfCompress"), {
  ssr: false,
});

type Tool = "edit" | "merge" | "split" | "organize" | "compress";

export default function PdfEditorApp() {
  const [activeTool, setActiveTool] = useState<Tool>("edit");

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <nav className="z-[100] flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/20">
            <PenTool className="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white">
            PDF<span className="text-blue-600">Editor</span>
          </h1>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={() => setActiveTool("edit")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "edit"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <PenTool className="h-4 w-4" aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("organize")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "organize"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Layout className="h-4 w-4" aria-hidden="true" />
            Organize
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("compress")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "compress"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
            Compress
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("merge")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "merge"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Combine className="h-4 w-4" aria-hidden="true" />
            Merge
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("split")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "split"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Scissors className="h-4 w-4" aria-hidden="true" />
            Split
          </button>
        </div>

        <div className="hidden text-xs font-medium text-slate-400 sm:block">
          Client-Side Only - Secure
        </div>
      </nav>

      <div className="flex-1 overflow-hidden">
        {activeTool === "edit" && <PdfEditor />}
        {activeTool === "organize" && <PdfOrganizer />}
        {activeTool === "compress" && <PdfCompress />}
        {activeTool === "merge" && <PdfMerge />}
        {activeTool === "split" && <PdfSplit />}
      </div>
    </main>
  );
}
