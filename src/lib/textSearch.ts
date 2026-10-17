"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";

/**
 * Text of one page, built from the same items (and in the same order) as the spans that
 * pdf.js's TextLayer creates, so item `i` here is `textLayer.textDivs[i]`.
 */
export type PageText = {
  /** All item strings joined; a space is inserted at line ends so words don't run together. */
  text: string;
  /** Offset of each item's string inside `text`. */
  starts: number[];
  lengths: number[];
};

/** Part of a match that falls inside one text item (character offsets within the item). */
export type MatchSegment = { item: number; start: number; end: number };
export type SearchMatch = { page: number; segments: MatchSegment[] };

async function loadPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageText> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  const starts: number[] = [];
  const lengths: number[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    starts.push(text.length);
    lengths.push(item.str.length);
    text += item.str;
    if (item.hasEOL) text += " ";
  }
  return { text, starts, lengths };
}

/**
 * Lowercases and turns every kind of whitespace into a plain space without changing the
 * string's length, so offsets in the result still point into the original text.
 */
function foldPreservingOffsets(text: string) {
  let out = "";
  for (const ch of text) {
    if (/\s/.test(ch)) {
      out += " ".repeat(ch.length);
      continue;
    }
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive; any run of spaces in the query matches any run of whitespace in the page. */
function queryPattern(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(words.map(escapeRegExp).join(" +"), "g");
}

export function findMatches(pages: PageText[], query: string): SearchMatch[] {
  const pattern = queryPattern(query);
  if (!pattern) return [];
  const matches: SearchMatch[] = [];
  pages.forEach((page, index) => {
    const folded = foldPreservingOffsets(page.text);
    for (const m of folded.matchAll(pattern)) {
      const from = m.index;
      const to = from + m[0].length;
      const segments: MatchSegment[] = [];
      page.starts.forEach((start, item) => {
        const end = start + page.lengths[item];
        if (end <= from || start >= to) return;
        segments.push({ item, start: Math.max(from, start) - start, end: Math.min(to, end) - start });
      });
      if (segments.length > 0) matches.push({ page: index + 1, segments });
    }
  });
  return matches;
}

/** A rectangle in PDF points, top-left origin, in the page's displayed orientation. */
export type PageRect = { page: number; x: number; y: number; width: number; height: number };

/**
 * Page-space rectangles covering each match. Text is laid out with an off-screen pdf.js TextLayer
 * at scale 1 (the same layout the visible layer uses), so it works for pages that aren't rendered.
 * `padding` (points) grows each rectangle so redaction boxes fully cover the glyphs.
 */
export async function measureMatchRects(pdf: PDFDocumentProxy, matches: SearchMatch[], padding = 0) {
  const rects: PageRect[] = [];
  const pages = [...new Set(matches.map((m) => m.page))];
  for (const pageNumber of pages) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const container = document.createElement("div");
    container.className = "textLayer";
    Object.assign(container.style, { position: "fixed", left: "-100000px", top: "0", visibility: "hidden" });
    container.style.setProperty("--total-scale-factor", "1");
    document.body.append(container);
    try {
      const layer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
      await layer.render();
      const origin = container.getBoundingClientRect();
      const range = document.createRange();
      for (const match of matches.filter((m) => m.page === pageNumber)) {
        for (const { item, start, end } of match.segments) {
          const node = layer.textDivs[item]?.firstChild;
          if (!node || node.nodeType !== Node.TEXT_NODE) continue;
          const length = (node as Text).length;
          range.setStart(node, Math.min(start, length));
          range.setEnd(node, Math.min(end, length));
          for (const r of range.getClientRects()) {
            rects.push({
              page: pageNumber,
              x: Math.max(0, r.left - origin.left - padding),
              y: Math.max(0, r.top - origin.top - padding),
              width: r.width + padding * 2,
              height: r.height + padding * 2,
            });
          }
        }
      }
    } finally {
      container.remove();
    }
  }
  return rects;
}

const SEARCH_DEBOUNCE_MS = 200;
const NO_MATCHES: SearchMatch[] = [];

/**
 * Searches the whole document. Page text is extracted once per document, on the first search.
 * `onResults` runs whenever a new result set arrives (e.g. to jump to the first match).
 */
export function useTextSearch(
  pdfDoc: PDFDocumentProxy | null,
  query: string,
  enabled: boolean,
  onResults?: (matches: SearchMatch[]) => void,
) {
  const cacheRef = useRef<{ doc: PDFDocumentProxy; pages: Promise<PageText[]> } | null>(null);
  const onResultsRef = useRef(onResults);
  const [result, setResult] = useState<{
    doc: PDFDocumentProxy;
    key: string;
    matches: SearchMatch[];
    hasText: boolean;
  } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    onResultsRef.current = onResults;
  });

  const active = enabled && !!pdfDoc && query.trim() !== "";
  const key = active ? query.trim().toLowerCase() : "";

  useEffect(() => {
    if (!active || !pdfDoc) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cacheRef.current?.doc !== pdfDoc) {
        const pages = Promise.all(
          Array.from({ length: pdfDoc.numPages }, (_, i) => loadPageText(pdfDoc, i + 1)),
        );
        cacheRef.current = { doc: pdfDoc, pages };
      }
      setLoadingKey(key);
      try {
        const pages = await cacheRef.current.pages;
        if (cancelled) return;
        const matches = findMatches(pages, key);
        setResult({ doc: pdfDoc, key, matches, hasText: pages.some((p) => p.text.trim() !== "") });
        onResultsRef.current?.(matches);
      } catch (err) {
        console.error("Text search failed", err);
        // Let the next search try again instead of reusing a failed extraction
        cacheRef.current = null;
      } finally {
        if (!cancelled) setLoadingKey(null);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, pdfDoc, key]);

  const upToDate = active && result?.doc === pdfDoc && result.key === key;
  return {
    matches: upToDate ? result.matches : NO_MATCHES,
    /** False once a search has shown the document has no text layer at all (e.g. a scan). */
    hasText: upToDate ? result.hasText : true,
    // Waiting for the debounce counts as searching too, so the UI never flashes "no results"
    searching: active && (!upToDate || loadingKey === key),
  };
}
