"use client";

import React, { useEffect, useRef, useState } from "react";
import { pdfjsLib } from "@/lib/pdfjs";

const RENDER_DEBOUNCE_MS = 120;

// Renders one PDF page, only while it is on (or near) screen. The canvas is stretched with CSS
// to the page box, so during zoom the old bitmap is scaled until the sharp re-render lands.
export default function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The scroll container must be the root: an ancestor's overflow clipping would cancel rootMargin
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { root: canvas.closest("[data-scroll-root]"), rootMargin: "1000px 0px" }
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isNearViewport) {
      // Free the bitmap of far-away pages so long documents stay light
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });

      // Render off-screen, then swap in, so the visible canvas never flashes blank
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) return;

      renderTask = page.render({ canvasContext: offscreenCtx, viewport, canvas: offscreen });
      try {
        await renderTask.promise;
      } catch (e) {
        if (!(e instanceof Error) || e.name !== "RenderingCancelledException") {
          console.error("Render error", e);
        }
        return;
      }
      if (cancelled) return;

      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
    }, RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale, isNearViewport]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />;
}
