"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PenTool, Combine, Scissors, Layout, Minimize2, Stamp, Lock, FileImage, Images } from "lucide-react";
import { toolList, type ToolId } from "@/lib/tools";

const PdfEditor = dynamic(() => import("@/components/PdfEditor"), { ssr: false });
const PdfMerge = dynamic(() => import("@/components/PdfMerge"), { ssr: false });
const PdfSplit = dynamic(() => import("@/components/PdfSplit"), { ssr: false });
const PdfOrganizer = dynamic(() => import("@/components/PdfOrganizer"), {
  ssr: false,
});
const PdfCompress = dynamic(() => import("@/components/PdfCompress"), {
  ssr: false,
});

const PdfToImage = dynamic(() => import("@/components/PdfToImage"), {
  ssr: false,
});

const ImageToPdf = dynamic(() => import("@/components/ImageToPdf"), {
  ssr: false,
});

const PdfWatermark = dynamic(() => import("@/components/PdfWatermark"), {
  ssr: false,
});

const PdfProtect = dynamic(() => import("@/components/PdfProtect"), {
  ssr: false,
});

const icons = {
  edit: PenTool,
  organize: Layout,
  compress: Minimize2,
  merge: Combine,
  split: Scissors,
  "pdf-to-image": FileImage,
  "image-to-pdf": Images,
  watermark: Stamp,
  protect: Lock,
} as const;

export default function PdfEditorApp({ tool }: Readonly<{ tool: ToolId }>) {
  return (
    <main className="flex h-dvh w-full shrink-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <nav className="z-[100] flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/20">
            <PenTool className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-slate-800 sm:inline dark:text-white">
            PDF<span className="text-blue-600">Editor</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/50">
          {toolList.map((item) => {
            const Icon = icons[item.id];
            const active = item.id === tool;
            return (
              <Link
                key={item.id}
                href={item.path}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all sm:px-4 ${
                  active
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden text-xs font-medium text-slate-400 lg:block">
          Client-Side Only - Secure
        </div>
      </nav>

      <div className="flex-1 overflow-hidden">
        {tool === "edit" && <PdfEditor />}
        {tool === "organize" && <PdfOrganizer />}
        {tool === "compress" && <PdfCompress />}
        {tool === "merge" && <PdfMerge />}
        {tool === "split" && <PdfSplit />}
        {tool === "pdf-to-image" && <PdfToImage />}
        {tool === "image-to-pdf" && <ImageToPdf />}
        {tool === "watermark" && <PdfWatermark />}
        {tool === "protect" && <PdfProtect />}
      </div>
    </main>
  );
}
