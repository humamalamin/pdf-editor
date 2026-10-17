import { PDFDocument } from "pdf-lib";
import { pdfjsLib } from "@/lib/pdfjs";

export type CompressionLevel = "low" | "medium" | "high";

export type CompressResult = {
  bytes: Uint8Array;
  /** False when a target size was requested but could not be reached. */
  reachedTarget: boolean;
};

/** Progress events, turned into translated text by the UI. */
export type CompressProgress =
  | { stage: "render" }
  | { stage: "compress" }
  | { stage: "optimize" }
  | { stage: "renderAt"; dpi: number }
  | { stage: "tryQuality"; quality: number; dpi: number };

type Options = {
  signal?: AbortSignal;
  onProgress?: (progress: CompressProgress) => void;
};

export type RenderedPage = {
  canvas: HTMLCanvasElement;
  /** Original page size in PDF points. */
  width: number;
  height: number;
};

export class CompressCancelledError extends Error {
  constructor() {
    super("Compression cancelled");
  }
}

export const LARGE_PDF_PAGES = 100;

const MAX_CANVAS_SIDE = 3000;
const TARGET_SCALES = [1.5, 1.0, 0.75, 0.5];
const MIN_QUALITY = 0.3;
const MAX_QUALITY = 0.9;
const SEARCH_ITERATIONS = 5;
const ACCEPT_RATIO = 0.9;

const LEVEL_SETTINGS = {
  medium: { scale: 2.25, quality: 0.7 },
  high: { scale: 1.125, quality: 0.4 },
} as const;

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new CompressCancelledError();
}

async function saveBasic(buffer: ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(buffer);
  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function renderPages(
  buffer: ArrayBuffer,
  scale: number,
  signal?: AbortSignal,
): Promise<RenderedPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const pages: RenderedPage[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      throwIfCancelled(signal);
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const effectiveScale = Math.min(
        scale,
        MAX_CANVAS_SIDE / Math.max(base.width, base.height),
      );
      const viewport = page.getViewport({ scale: effectiveScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) continue;

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      pages.push({ canvas, width: base.width, height: base.height });
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}

export function releasePages(pages: RenderedPage[]) {
  for (const { canvas } of pages) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("Failed to encode page"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function buildPdf(
  pages: RenderedPage[],
  quality: number,
  signal?: AbortSignal,
) {
  const doc = await PDFDocument.create();
  for (const { canvas, width, height } of pages) {
    throwIfCancelled(signal);
    const img = await doc.embedJpg(await canvasToJpeg(canvas, quality));
    const page = doc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  return doc.save({ useObjectStreams: true });
}

export async function compressByLevel(
  buffer: ArrayBuffer,
  level: CompressionLevel,
  { signal, onProgress }: Options = {},
): Promise<CompressResult> {
  if (level === "low") {
    return { bytes: await saveBasic(buffer), reachedTarget: true };
  }

  const { scale, quality } = LEVEL_SETTINGS[level];
  onProgress?.({ stage: "render" });
  const pages = await renderPages(buffer, scale, signal);
  try {
    onProgress?.({ stage: "compress" });
    return { bytes: await buildPdf(pages, quality, signal), reachedTarget: true };
  } finally {
    releasePages(pages);
  }
}

/**
 * Finds the best-looking output at or below `targetBytes`.
 * Lossless first, then a binary search over JPEG quality, then lower render
 * scales when even the minimum quality is too large.
 */
export async function compressToTarget(
  buffer: ArrayBuffer,
  targetBytes: number,
  { signal, onProgress }: Options = {},
): Promise<CompressResult> {
  onProgress?.({ stage: "optimize" });
  const basic = await saveBasic(buffer);
  if (basic.length <= targetBytes) {
    return { bytes: basic, reachedTarget: true };
  }

  let smallest: Uint8Array | null = null;
  const track = (bytes: Uint8Array) => {
    if (!smallest || bytes.length < smallest.length) smallest = bytes;
  };

  for (const scale of TARGET_SCALES) {
    onProgress?.({ stage: "renderAt", dpi: Math.round(scale * 72) });
    const pages = await renderPages(buffer, scale, signal);

    try {
      const attempt = async (quality: number) => {
        throwIfCancelled(signal);
        onProgress?.({ stage: "tryQuality", quality: Math.round(quality * 100), dpi: Math.round(scale * 72) });
        const bytes = await buildPdf(pages, quality, signal);
        track(bytes);
        return bytes;
      };

      const best = await attempt(MAX_QUALITY);
      if (best.length <= targetBytes) {
        return { bytes: best, reachedTarget: true };
      }

      const floor = await attempt(MIN_QUALITY);
      if (floor.length > targetBytes) continue;

      let result = floor;
      let lo = MIN_QUALITY;
      let hi = MAX_QUALITY;
      for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        if (result.length >= targetBytes * ACCEPT_RATIO) break;
        const mid = (lo + hi) / 2;
        const bytes = await attempt(mid);
        if (bytes.length <= targetBytes) {
          result = bytes;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return { bytes: result, reachedTarget: true };
    } finally {
      releasePages(pages);
    }
  }

  return { bytes: smallest ?? basic, reachedTarget: false };
}

export async function getPageCount(buffer: ArrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  try {
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
}
