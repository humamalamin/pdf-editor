"use client";

import dynamic from "next/dynamic";

const PdfEditor = dynamic(() => import("@/components/PdfEditor"), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <PdfEditor />
    </main>
  );
}
