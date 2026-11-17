"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, FolderOpen, Menu, Plus, X } from "lucide-react";
import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { categoryIconClass, toolIcons } from "@/lib/toolIcons";
import { toolCategories, toolCategoryIds, toolPath, type ToolCategory } from "@/lib/tools";
import BrandLogo from "@/components/BrandLogo";

function LanguageSwitch() {
  const { t, locale } = useI18n();
  return (
    <div role="group" aria-label={t.nav.language} className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 text-xs font-bold">
      {locales.map((code) => (
        <Link
          key={code}
          href={toolPath("edit", code)}
          hrefLang={code}
          lang={code}
          aria-current={code === locale ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 uppercase transition-colors",
            code === locale ? "bg-ink text-paper" : "text-muted hover:text-ink"
          )}
        >
          {code}
        </Link>
      ))}
    </div>
  );
}

type DropProps = {
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

const container = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

/**
 * Home page shown on the editor route before a PDF is opened: hero with the drop zone,
 * every tool grouped by category, how it works, file safety, and FAQ.
 */
export default function HomeLanding({
  onFile,
  dropProps,
  isDragging,
  resume,
}: Readonly<{
  onFile: (file: File | undefined) => void;
  dropProps: DropProps;
  isDragging: boolean;
  resume?: ReactNode;
}>) {
  const { t, locale } = useI18n();
  const h = t.home;
  const [category, setCategory] = useState<ToolCategory | "all">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const visible = category === "all" ? toolCategoryIds : [category];
  const menu = [
    { href: "#tools", label: h.menu.tools },
    { href: "#how", label: h.menu.how },
    { href: "#privacy", label: h.menu.privacy },
    { href: "#faq", label: h.menu.faq },
  ];

  return (
    <div className="h-full w-full overflow-y-auto scroll-smooth bg-paper text-ink">
      {/* Site header, as in the design: logo, section links, language */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className={cn(container, "flex h-[60px] items-center justify-between gap-6 sm:h-[72px]")}>
          <BrandLogo href={toolPath("edit", locale)} />
          <nav aria-label={h.menu.label} className="hidden items-center gap-7 text-[15px] font-medium lg:flex">
            {menu.map((item) => (
              <a key={item.href} href={item.href} className="text-ink transition-colors hover:text-link">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="home-menu"
              aria-label={menuOpen ? h.menu.close : h.menu.open}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-surface lg:hidden"
            >
              {menuOpen ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="home-menu" aria-label={h.menu.label} className="border-t border-line bg-paper lg:hidden">
            <ul className={cn(container, "flex flex-col py-2")}>
              {menu.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-12 items-center text-base font-medium text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className={cn(container, "flex flex-wrap items-center gap-10 py-12 sm:gap-14 sm:py-[72px]")}>
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
          <p className="font-mono text-[13px] tracking-[0.04em] text-muted uppercase">{h.eyebrow}</p>
          <h1 className="text-[40px] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[64px] sm:leading-[1.02]">
            {h.heroTitle}{" "}
            <span className="mx-[-2px] bg-[linear-gradient(transparent_56%,var(--color-marker)_56%,var(--color-marker)_94%,transparent_94%)] px-1.5">
              {h.heroHighlight}
            </span>
          </h1>
          <p className="max-w-[30em] text-[17px] leading-[1.55] text-pretty text-ink-soft sm:text-[19px]">{h.heroText}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {h.heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="h-[18px] w-[18px] text-ink" strokeWidth={2} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_1px_0_var(--color-line),0_24px_48px_-32px_rgba(21,23,28,0.35)]">
          {resume}
          <label
            {...dropProps}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-4 rounded-[10px] border-2 border-dashed border-line-strong bg-paper-soft px-6 pt-12 pb-10 text-center transition-colors hover:border-ink focus-within:border-ink",
              isDragging && "border-ink bg-marker/25"
            )}
          >
            <svg width="56" height="64" viewBox="0 0 56 64" fill="none" aria-hidden="true">
              <path d="M4 4h32l16 16v40H4z" className="fill-surface stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M36 4v16h16" className="stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M28 50V30M20 38l8-8 8 8" className="stroke-ink" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="flex flex-col gap-1.5">
              <span className="text-[22px] font-semibold tracking-[-0.01em]">{h.dropTitle}</span>
              <span className="text-[15px] text-muted">{h.dropOr}</span>
            </span>
            <span className="flex h-[52px] items-center gap-2.5 rounded-[10px] bg-ink px-7 text-base font-semibold text-paper">
              <FolderOpen className="h-[18px] w-[18px]" aria-hidden="true" />
              {h.chooseFile}
            </span>
            <span className="font-mono text-xs text-muted">{h.dropNote}</span>
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          <div className="flex flex-col gap-2.5 px-2 pt-1 pb-1">
            <p className="text-[13px] font-medium text-muted">{h.quickTitle}</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-2">
              {h.quickTools.map((id) => (
                <Link
                  key={id}
                  href={toolPath(id, locale)}
                  className="flex h-11 items-center justify-center rounded-lg border border-line px-2 text-center text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  {t.tools[id].label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* All tools */}
      <section id="tools" className="scroll-mt-[72px] border-t border-line bg-surface">
        <div className={cn(container, "flex flex-col gap-8 py-16 sm:py-20")}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-2.5">
              <h2 className="text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[40px]">{h.toolsTitle}</h2>
              <p className="text-[17px] text-muted">{h.toolsText}</p>
            </div>
            <div role="group" aria-label={h.filterLabel} className="flex flex-wrap gap-2">
              {(["all", ...toolCategoryIds] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                    category === id
                      ? "border-ink bg-ink text-paper"
                      : "border-line-strong bg-surface text-ink hover:border-ink"
                  )}
                >
                  {h.categories[id]}
                </button>
              ))}
            </div>
          </div>

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(270px,100%),1fr))] gap-3">
            {visible.flatMap((cat) =>
              toolCategories[cat].map((id) => {
                const Icon = toolIcons[id];
                return (
                  <li key={id}>
                    <Link
                      href={toolPath(id, locale)}
                      className="flex h-full min-h-[136px] flex-col gap-3.5 rounded-xl border border-line bg-paper p-5 text-ink transition-[border-color,transform] hover:-translate-y-px hover:border-ink"
                    >
                      <span className={cn("flex h-11 w-11 items-center justify-center rounded-[10px]", categoryIconClass[cat])}>
                        <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-[17px] font-semibold">{t.tools[id].label}</span>
                        <span className="text-sm leading-[1.45] text-muted">{h.toolBlurbs[id]}</span>
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-[72px] border-t border-line">
        <div className={cn(container, "flex flex-col gap-10 py-16 sm:py-20")}>
          <h2 className="text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[40px]">{h.stepsTitle}</h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] border-t-2 border-ink">
            {h.steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3 pt-6 pr-8 pb-2">
                <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[22px] font-semibold tracking-[-0.01em]">{step.title}</span>
                <span className="text-base leading-[1.55] text-ink-soft">{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* File safety */}
      <section id="privacy" className="scroll-mt-[72px] bg-night text-[#F5F4F0]">
        <div className={cn(container, "flex flex-wrap gap-14 py-16 sm:py-[88px]")}>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <p className="font-mono text-[13px] tracking-[0.04em] text-[#A9ACB3] uppercase">{h.privacyEyebrow}</p>
            <h2 className="text-[34px] leading-[1.08] font-bold tracking-[-0.03em] sm:text-[44px]">{h.privacyTitle}</h2>
            <p className="max-w-[28em] text-[17px] leading-relaxed text-[#C9CBD0]">{h.privacyText}</p>
          </div>
          <ul className="flex min-w-0 flex-[1_1_460px] flex-col">
            {h.privacyPoints.map((point, i) => (
              <li key={point.title} className="flex gap-5 border-t border-[#33363D] py-5 last:border-b">
                <span className="w-7 shrink-0 font-mono text-sm text-marker">{String.fromCharCode(65 + i)}</span>
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{point.title}</span>
                  <span className="text-[15px] leading-normal text-[#A9ACB3]">{point.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-[72px]">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-4 py-16 sm:px-6 sm:py-[88px]">
          <h2 className="text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[40px]">{h.faqTitle}</h2>
          <div className="flex flex-col border-t border-line-strong">
            {t.tools.edit.faq.map((item, i) => (
              <details key={item.question} open={i === 0} className="group border-b border-line-strong py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Plus className="h-5 w-5 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="mb-5 max-w-[40em] text-base leading-relaxed text-ink-soft">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className={cn(container, "flex flex-wrap justify-between gap-4 pt-8 pb-10 text-sm text-muted")}>
          <span>© {new Date().getFullYear()} pdfeditor.my.id</span>
          <span>{t.privacy.note}</span>
        </div>
      </footer>
    </div>
  );
}
