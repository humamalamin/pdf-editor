"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Languages, X } from "lucide-react";

const STORAGE_KEY = "pdfeditor:language-suggestion-dismissed";

/**
 * Offers the Indonesian version to visitors whose browser's primary language is Indonesian.
 * Shown on English pages only, and written in Indonesian since that is who it is for.
 */
export default function LanguageSuggestion({ href }: Readonly<{ href: string }>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only the first preference counts: an English-first visitor who also lists Indonesian wants English.
    const primary = navigator.languages?.[0] ?? navigator.language ?? "";
    const prefersIndonesian = primary.toLowerCase().startsWith("id");
    if (!prefersIndonesian) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // Storage blocked: still show the banner, it just won't stay dismissed.
    }
    // Reading the browser language is only possible after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore: dismissal just won't persist.
    }
  };

  return (
    <div
      lang="id"
      className="flex shrink-0 items-center justify-center gap-3 bg-blue-600 px-4 py-2 text-sm text-white"
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Halaman ini tersedia dalam Bahasa Indonesia.</span>
      <Link href={href} hrefLang="id" className="font-bold underline underline-offset-2 hover:no-underline">
        Buka versi Indonesia
      </Link>
      <button onClick={dismiss} aria-label="Tutup" className="rounded p-1 hover:bg-white/20">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
