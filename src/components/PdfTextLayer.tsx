"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pdfjsLib } from "@/lib/pdfjs";
import type { MatchSegment } from "@/lib/textSearch";

export type TextHighlight = { segments: MatchSegment[]; current: boolean };

const HIGHLIGHT_CLASS = "absolute rounded-sm bg-yellow-300/60";
const CURRENT_HIGHLIGHT_CLASS = "absolute rounded-sm bg-orange-400/60";

// Invisible, selectable copy of the page's text (pdf.js TextLayer) laid over the canvas, plus
// search highlights measured from it. Like the canvas, it only exists while the page is near
// the viewport.
export default function PdfTextLayer({
  pdfDoc,
  pageNumber,
  scale,
  interactive,
  highlights,
  scrollToken,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  interactive: boolean; // off while a drawing tool is active, so clicks reach the page
  highlights: TextHighlight[];
  scrollToken: number; // changes when the user moves to another match: scroll it into view
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<{ layer: pdfjsLib.TextLayer; page: pdfjsLib.PDFPageProxy } | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const scrolledTokenRef = useRef(-1);
  const scaleRef = useRef(scale);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [renderedVersion, setRenderedVersion] = useState(0);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsNearViewport(entry.isIntersecting), {
      root: el.closest("[data-scroll-root]"),
      rootMargin: "1000px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = layerRef.current;
    if (!container || !isNearViewport) return;
    let cancelled = false;
    let layer: pdfjsLib.TextLayer | null = null;

    (async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: scaleRef.current });
      container.style.setProperty("--total-scale-factor", String(scaleRef.current));
      container.replaceChildren();
      layer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
      await layer.render();
      if (cancelled) return;
      // Lets a drag that leaves the last line keep extending the selection (as in pdf.js's viewer)
      const end = document.createElement("div");
      end.className = "endOfContent";
      container.append(end);
      textLayerRef.current = { layer, page };
      setRenderedVersion((v) => v + 1);
    })().catch((e) => {
      if (!(e instanceof Error) || e.name !== "AbortException") console.error("Text layer error", e);
    });

    return () => {
      cancelled = true;
      layer?.cancel();
      textLayerRef.current = null;
      container.replaceChildren();
    };
  }, [pdfDoc, pageNumber, isNearViewport]);

  // Zoom: re-lay out the existing spans instead of rebuilding them
  useLayoutEffect(() => {
    const container = layerRef.current;
    const current = textLayerRef.current;
    if (!container || !current) return;
    container.style.setProperty("--total-scale-factor", String(scale));
    current.layer.update({ viewport: current.page.getViewport({ scale }) });
  }, [scale, renderedVersion]);

  // Search highlights are measured from the rendered spans (they carry the real glyph widths)
  // and drawn straight into the overlay; they are pure DOM measurements, not React state.
  useLayoutEffect(() => {
    const overlay = highlightLayerRef.current;
    const container = layerRef.current;
    const current = textLayerRef.current;
    if (!overlay) return;
    overlay.replaceChildren();
    if (!container || !current || highlights.length === 0) return;

    const origin = container.getBoundingClientRect();
    const range = document.createRange();
    let currentBox: HTMLDivElement | null = null;
    for (const { segments, current: isCurrent } of highlights) {
      for (const { item, start, end } of segments) {
        const node = current.layer.textDivs[item]?.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const length = (node as Text).length;
        range.setStart(node, Math.min(start, length));
        range.setEnd(node, Math.min(end, length));
        for (const r of range.getClientRects()) {
          const box = document.createElement("div");
          box.className = isCurrent ? CURRENT_HIGHLIGHT_CLASS : HIGHLIGHT_CLASS;
          Object.assign(box.style, {
            left: `${r.left - origin.left - 1}px`,
            top: `${r.top - origin.top - 1}px`,
            width: `${r.width + 2}px`,
            height: `${r.height + 2}px`,
          });
          overlay.append(box);
          if (isCurrent) currentBox ??= box;
        }
      }
    }

    if (currentBox && scrolledTokenRef.current !== scrollToken) {
      scrolledTokenRef.current = scrollToken;
      // Centre it by scrolling only the editor (scrollIntoView would also scroll the window)
      const scroller = container.closest<HTMLElement>("[data-scroll-root]");
      if (scroller) {
        const box = currentBox.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        scroller.scrollTo({
          top: scroller.scrollTop + box.top - view.top - (view.height - box.height) / 2,
          left: scroller.scrollLeft + Math.min(0, box.left - view.left) + Math.max(0, box.right - view.right),
          behavior: "smooth",
        });
      }
    }
  }, [highlights, scale, renderedVersion, scrollToken]);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <div ref={highlightLayerRef} className="pointer-events-none absolute inset-0 mix-blend-multiply" />
      <div
        ref={layerRef}
        className="textLayer"
        style={{ pointerEvents: interactive ? undefined : "none" }}
        onPointerDown={(e) => {
          // While dragging, stretch the end-of-content block over the page so the selection
          // doesn't jump to the end of the text when the pointer passes between lines
          const layer = e.currentTarget;
          layer.classList.add("selecting");
          window.addEventListener("pointerup", () => layer.classList.remove("selecting"), { once: true });
        }}
      />
    </div>
  );
}
