import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { buildPdf, releasePages, renderPages } from "@/lib/compress";

export type WatermarkPattern = "tile" | "center";

export type WatermarkOptions = {
  text: string;
  size: number;
  /** 0 to 1 */
  opacity: number;
  /** #rrggbb */
  color: string;
  /** Degrees, counter-clockwise (PDF convention). */
  angle: number;
  pattern: WatermarkPattern;
  /** 1-based page numbers. Null means every page. */
  pages: Set<number> | null;
  /** Render pages to images so the watermark cannot be removed. */
  flatten: boolean;
};

type Mark = { cx: number; cy: number };

const FLATTEN_SCALE = 2;
const FLATTEN_QUALITY = 0.9;
const IMAGE_PAGE_WIDTH = 595;
// Standard Helvetica supports Latin-1 text; anything else would make pdf-lib throw.
const SUPPORTED_TEXT = /^[ -~ -ÿ]+$/;

export function isSupportedText(text: string) {
  return SUPPORTED_TEXT.test(text);
}

/** Parses "1-3, 5" into a set of page numbers. Returns null if invalid. */
export function parsePageRange(input: string, totalPages: number) {
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) return null;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from || to > totalPages) return null;
    for (let p = from; p <= to; p++) pages.add(p);
  }
  return pages.size > 0 ? pages : null;
}

export function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

/** Mark centers in PDF coordinates (origin bottom-left). */
function computeMarks(
  pageW: number,
  pageH: number,
  textWidth: number,
  { size, angle, pattern }: Pick<WatermarkOptions, "size" | "angle" | "pattern">,
): Mark[] {
  const cx = pageW / 2;
  const cy = pageH / 2;
  if (pattern === "center") return [{ cx, cy }];

  const theta = (angle * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const stepX = textWidth * 1.4;
  const stepY = size * 3;
  const half = Math.hypot(pageW, pageH) / 2;
  const cols = Math.ceil(half / stepX) + 1;
  const rows = Math.ceil(half / stepY) + 1;
  const margin = textWidth / 2;

  const marks: Mark[] = [];
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const u = i * stepX + (Math.abs(j) % 2) * (stepX / 2);
      const v = j * stepY;
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;
      if (x > -margin && x < pageW + margin && y > -margin && y < pageH + margin) {
        marks.push({ cx: x, cy: y });
      }
    }
  }
  return marks;
}

/** Draws the watermark onto a canvas whose pixel size is `scale` times the page size in points. */
export function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  pageW: number,
  pageH: number,
  scale: number,
  options: WatermarkOptions,
) {
  const { text, size, opacity, color, angle } = options;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  const marks = computeMarks(pageW, pageH, ctx.measureText(text).width, options);
  for (const { cx, cy } of marks) {
    ctx.save();
    ctx.translate(cx, pageH - cy);
    ctx.rotate((-angle * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Wraps an image file as a single-page PDF sized to the image. */
export async function imageToPdf(file: File): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  // JPEG has no alpha channel, so flatten transparency onto white.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Failed to read image");

  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  const width = IMAGE_PAGE_WIDTH;
  const height = (img.height / img.width) * width;
  doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function applyWatermark(
  buffer: ArrayBuffer,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  if (options.flatten) return flattenWithWatermark(buffer, options);

  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgb(options.color);
  const theta = (options.angle * Math.PI) / 180;
  const textWidth = font.widthOfTextAtSize(options.text, options.size);
  // Marks are centered, but pdf-lib rotates around the text's bottom-left origin.
  const halfW = textWidth / 2;
  const halfH = (options.size * 0.7) / 2;
  const dx = -halfW * Math.cos(theta) + halfH * Math.sin(theta);
  const dy = -halfW * Math.sin(theta) - halfH * Math.cos(theta);

  doc.getPages().forEach((page, index) => {
    if (options.pages && !options.pages.has(index + 1)) return;
    const { width, height } = page.getSize();
    for (const { cx, cy } of computeMarks(width, height, textWidth, options)) {
      page.drawText(options.text, {
        x: cx + dx,
        y: cy + dy,
        size: options.size,
        font,
        color: rgb(r, g, b),
        opacity: options.opacity,
        rotate: degrees(options.angle),
      });
    }
  });

  return doc.save();
}

async function flattenWithWatermark(buffer: ArrayBuffer, options: WatermarkOptions) {
  const pages = await renderPages(buffer, FLATTEN_SCALE);
  try {
    pages.forEach(({ canvas, width, height }, index) => {
      if (options.pages && !options.pages.has(index + 1)) return;
      const ctx = canvas.getContext("2d");
      if (ctx) drawWatermarkOnCanvas(ctx, width, height, canvas.width / width, options);
    });
    return await buildPdf(pages, FLATTEN_QUALITY);
  } finally {
    releasePages(pages);
  }
}
