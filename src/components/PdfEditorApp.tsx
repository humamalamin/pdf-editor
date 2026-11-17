"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import Link from "next/link";
import { locales, type Locale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { toolPath, type ToolId } from "@/lib/tools";
import LanguageSuggestion from "@/components/LanguageSuggestion";
import ToolInfoDialog from "@/components/ToolInfoDialog";
import BrandLogo from "@/components/BrandLogo";
import ToolsMenu from "@/components/ToolsMenu";

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

const PdfToWord = dynamic(() => import("@/components/PdfToWord"), {
  ssr: false,
});

const PdfPageNumbers = dynamic(() => import("@/components/PdfPageNumbers"), {
  ssr: false,
});

const PdfWatermark = dynamic(() => import("@/components/PdfWatermark"), {
  ssr: false,
});

const PdfProtect = dynamic(() => import("@/components/PdfProtect"), {
  ssr: false,
});

export default function PdfEditorApp({
  tool,
  locale,
  dict,
  info,
}: Readonly<{ tool: ToolId; locale: Locale; dict: Dictionary; info: ReactNode }>) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <main className="flex h-dvh w-full shrink-0 flex-col overflow-hidden bg-paper">
        {locale === "en" && <LanguageSuggestion href={toolPath(tool, "id")} />}
        {/* The home/editor route brings its own header: the landing menu, or the editor's top bar */}
        {tool !== "edit" && (
        <header className="relative z-[100] border-b border-line bg-paper text-ink">
          <div className="mx-auto flex h-[60px] w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-6">
              <BrandLogo href={toolPath("edit", locale)} compact />
              <ToolsMenu current={tool} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden font-mono text-xs text-muted xl:block">{dict.nav.clientSide}</span>
              <ToolInfoDialog label={dict.toolPage.info} closeLabel={dict.toolPage.close}>
                {info}
              </ToolInfoDialog>
              <div
                role="group"
                aria-label={dict.nav.language}
                className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 text-xs font-bold"
              >
                {locales.map((code) => (
                  <Link
                    key={code}
                    href={toolPath(tool, code)}
                    hrefLang={code}
                    lang={code}
                    aria-current={code === locale ? "true" : undefined}
                    className={`rounded-md px-2.5 py-1.5 uppercase transition-colors ${
                      code === locale ? "bg-ink text-paper" : "text-muted hover:text-ink"
                    }`}
                  >
                    {code}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </header>
        )}

        <div className="flex-1 overflow-hidden">
          {tool === "edit" && <PdfEditor />}
          {tool === "organize" && <PdfOrganizer />}
          {tool === "compress" && <PdfCompress />}
          {tool === "merge" && <PdfMerge />}
          {tool === "split" && <PdfSplit />}
          {tool === "pdf-to-image" && <PdfToImage />}
          {tool === "image-to-pdf" && <ImageToPdf />}
          {tool === "pdf-to-word" && <PdfToWord />}
          {tool === "page-numbers" && <PdfPageNumbers />}
          {tool === "watermark" && <PdfWatermark />}
          {tool === "protect" && <PdfProtect />}
        </div>
      </main>
    </I18nProvider>
  );
}
