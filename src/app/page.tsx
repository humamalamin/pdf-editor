"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { PenTool, Combine, Scissors, Layout, Minimize2 } from "lucide-react";

const PdfEditor = dynamic(() => import("@/components/PdfEditor"), { ssr: false });
const PdfMerge = dynamic(() => import("@/components/PdfMerge"), { ssr: false });
const PdfSplit = dynamic(() => import("@/components/PdfSplit"), { ssr: false });
const PdfOrganizer = dynamic(() => import("@/components/PdfOrganizer"), { ssr: false });
const PdfCompress = dynamic(() => import("@/components/PdfCompress"), { ssr: false });

type Tool = "edit" | "merge" | "split" | "organize" | "compress";

export default function Home() {
  const [activeTool, setActiveTool] = useState<Tool>("edit");

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3 dark:border-slate-800 dark:bg-slate-900 z-[100]">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/20">
            <PenTool className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-800 dark:text-white">
            PDF<span className="text-blue-600">Editor</span>
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/50">
          <button
            onClick={() => setActiveTool("edit")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "edit"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <PenTool className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => setActiveTool("organize")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "organize"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Layout className="h-4 w-4" />
            Organize
          </button>
          <button
            onClick={() => setActiveTool("compress")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "compress"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Minimize2 className="h-4 w-4" />
            Compress
          </button>
          <button
            onClick={() => setActiveTool("merge")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "merge"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Combine className="h-4 w-4" />
            Merge
          </button>
          <button
            onClick={() => setActiveTool("split")}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTool === "split"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Scissors className="h-4 w-4" />
            Split
          </button>
        </div>

        <div className="hidden sm:block text-xs font-medium text-slate-400">
          Client-Side Only • Secure
        </div>
      </nav>

      {/* Main Content Area */}
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
