import { PDFDocument, degrees, type PDFImage } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";

// ---------- PDF to images ----------

export type ImageFormat = "jpg" | "png";

/** Safari refuses canvases above roughly 16.7M pixels, so stay below that. */
const MAX_CANVAS_PIXELS = 16_000_000;

export class ConvertCancelledError extends Error {
  constructor() {
    super("Conversion cancelled");
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))), type, quality),
  );
}

/** Renders one page (1-based) at the given DPI and encodes it as JPG or PNG. */
export async function renderPageImage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const wanted = dpi / 72;
  const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
  const viewport = page.getViewport({ scale: Math.min(wanted, maxScale) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  // JPEG has no transparency, and PNG pages look wrong on dark viewers without a background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return await canvasToBlob(canvas, format === "jpg" ? "image/jpeg" : "image/png", quality);
  } finally {
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function pdfToImages(
  pdf: PDFDocumentProxy,
  pages: number[],
  options: {
    dpi: number;
    format: ImageFormat;
    quality: number;
    baseName: string;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
) {
  const digits = String(pdf.numPages).length;
  const results: { name: string; blob: Blob }[] = [];
  for (const [index, pageNumber] of pages.entries()) {
    if (options.signal?.aborted) throw new ConvertCancelledError();
    options.onProgress?.(index, pages.length);
    const blob = await renderPageImage(pdf, pageNumber, options.dpi, options.format, options.quality);
    const label = String(pageNumber).padStart(digits, "0");
    results.push({ name: `${options.baseName}-page-${label}.${options.format}`, blob });
  }
  options.onProgress?.(pages.length, pages.length);
  return results;
}

// ---------- Images to PDF ----------

export type PageSizeOption = "fit" | "a4" | "letter";
export type OrientationOption = "auto" | "portrait" | "landscape";
export type MarginOption = "none" | "small" | "large";

export type ImageItem = {
  file: File;
  /** Extra clockwise rotation chosen by the user: 0, 90, 180, or 270. */
  rotation: number;
};

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

const MARGINS: Record<MarginOption, number> = { none: 0, small: 20, large: 40 };

/** Image pixels are treated as 96 DPI when the page takes the image's own size. */
const PX_TO_PT = 72 / 96;

/** Reads the EXIF orientation tag from a JPEG. Returns 1 (upright) when absent. */
function jpegOrientation(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    // Start of scan: image data follows, no more metadata.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1;
    offset += 2 + length;
  }
  return 1;
}

/** Decodes any browser-supported image (EXIF rotation applied) and re-encodes it as JPEG. */
async function reencodeAsJpeg(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Embeds the original bytes when possible so the image is not recompressed. */
async function embedImage(doc: PDFDocument, file: File): Promise<PDFImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (file.type === "image/png") return await doc.embedPng(bytes);
    if (file.type === "image/jpeg" && jpegOrientation(bytes) === 1) return await doc.embedJpg(bytes);
  } catch {
    // Unusual encodings (e.g. 16-bit PNG): fall back to the browser decoder below.
  }
  return doc.embedJpg(await reencodeAsJpeg(file));
}

export async function imagesToPdf(
  items: ImageItem[],
  options: {
    pageSize: PageSizeOption;
    orientation: OrientationOption;
    margin: MarginOption;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const margin = MARGINS[options.margin];

  for (const [index, item] of items.entries()) {
    options.onProgress?.(index, items.length);
    const image = await embedImage(doc, item.file);
    const quarterTurn = item.rotation % 180 !== 0;
    // Size of the image as it appears on the page, after the user's rotation.
    const shownW = quarterTurn ? image.height : image.width;
    const shownH = quarterTurn ? image.width : image.height;

    let pageW: number;
    let pageH: number;
    if (options.pageSize === "fit") {
      pageW = shownW * PX_TO_PT + margin * 2;
      pageH = shownH * PX_TO_PT + margin * 2;
    } else {
      const [shortSide, longSide] = PAGE_SIZES[options.pageSize];
      const landscape =
        options.orientation === "landscape" || (options.orientation === "auto" && shownW > shownH);
      pageW = landscape ? longSide : shortSide;
      pageH = landscape ? shortSide : longSide;
    }

    const boxW = pageW - margin * 2;
    const boxH = pageH - margin * 2;
    const scale = Math.min(boxW / shownW, boxH / shownH);
    const drawW = shownW * scale;
    const drawH = shownH * scale;
    const left = (pageW - drawW) / 2;
    const bottom = (pageH - drawH) / 2;

    // pdf-lib rotates counter-clockwise around the image's bottom-left corner,
    // so shift the anchor to keep the rotated image inside its box.
    const w = image.width * scale;
    const h = image.height * scale;
    const anchor = {
      0: { x: left, y: bottom },
      90: { x: left, y: bottom + drawH },
      180: { x: left + drawW, y: bottom + drawH },
      270: { x: left + drawW, y: bottom },
    }[item.rotation as 0 | 90 | 180 | 270];

    doc.addPage([pageW, pageH]).drawImage(image, {
      x: anchor.x,
      y: anchor.y,
      width: w,
      height: h,
      rotate: degrees(-item.rotation),
    });
  }

  options.onProgress?.(items.length, items.length);
  return doc.save();
}
