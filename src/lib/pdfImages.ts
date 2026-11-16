import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";

/** An image as it appears on the page: encoded bytes plus its box in points, top-left origin. */
export type PageImage = {
  data: Uint8Array;
  type: "jpg" | "png";
  x: number;
  y: number;
  width: number;
  height: number;
};

type OperatorList = Awaited<ReturnType<PDFPageProxy["getOperatorList"]>>;
type Matrix = number[];
type Box = { x: number; y: number; width: number; height: number };

/** Decoded image as pdf.js hands it to the canvas: an ImageBitmap, or raw pixels of a given kind. */
type RawImage = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
};

const MIN_SIZE = 8; // points; smaller images are rules, bullets, or spacers
const MAX_SIDE = 2000; // pixels; keeps the .docx a sensible size
const MAX_IMAGES_PER_PAGE = 100;
const BACKGROUND_COVERAGE = 0.85;
const OBJ_TIMEOUT_MS = 3000;

// Same values as pdf.js's ImageKind.
const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;
const RGBA_32BPP = 3;

/** The page-space box that the unit square lands on under `m`. */
function unitSquareBox(m: Matrix): Box {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function clipToPage(box: Box, width: number, height: number): Box | null {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(width, box.x + box.width);
  const bottom = Math.min(height, box.y + box.height);
  return right - x >= MIN_SIZE && bottom - y >= MIN_SIZE ? { x, y, width: right - x, height: bottom - y } : null;
}

function resolveImage(page: PDFPageProxy, id: string) {
  const objs = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise<RawImage | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), OBJ_TIMEOUT_MS);
    objs.get(id, (data: RawImage) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Expands pdf.js's raw pixel formats to RGBA. */
function toRgba({ width, height, kind, data }: RawImage): Uint8ClampedArray<ArrayBuffer> | null {
  if (!data) return null;
  const out = new Uint8ClampedArray(width * height * 4);
  if (kind === RGBA_32BPP) {
    out.set(data.subarray(0, out.length));
  } else if (kind === RGB_24BPP) {
    for (let src = 0, dst = 0; dst < out.length; src += 3, dst += 4) {
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = 255;
    }
  } else if (kind === GRAYSCALE_1BPP) {
    // One bit per pixel, rows padded to whole bytes; a set bit is white.
    const rowBytes = (width + 7) >> 3;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = (data[row * rowBytes + (col >> 3)] >> (7 - (col & 7))) & 1 ? 255 : 0;
        const dst = (row * width + col) * 4;
        out[dst] = out[dst + 1] = out[dst + 2] = value;
        out[dst + 3] = 255;
      }
    }
  } else {
    return null;
  }
  return out;
}

function sourceOf(image: RawImage): CanvasImageSource | null {
  if (image.bitmap) return image.bitmap;
  const pixels = toRgba(image);
  if (!pixels) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return canvas;
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * Draws the image the way pdf.js does (unit square under the current transform, flipped),
 * so rotated, mirrored, and cropped images come out as they look on the page.
 */
async function encode(image: RawImage, ctm: Matrix, box: Box): Promise<PageImage | null> {
  const source = sourceOf(image);
  if (!source) return null;
  // Keep roughly the image's own resolution, but never below 1 px per point.
  const nativeScale = Math.sqrt((image.width * image.height) / (box.width * box.height));
  const scale = Math.min(Math.max(nativeScale, 1), MAX_SIDE / Math.max(box.width, box.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.width * scale));
  canvas.height = Math.max(1, Math.round(box.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.imageSmoothingQuality = "high";
    ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    ctx.transform(ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]);
    ctx.scale(1 / image.width, -1 / image.height);
    ctx.drawImage(source, 0, -image.height);

    const type = hasTransparency(ctx, canvas.width, canvas.height) ? "png" : "jpg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type === "png" ? "image/png" : "image/jpeg", 0.9),
    );
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), type, ...box };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Finds the images painted on a page by replaying the operator list's transforms.
 * `transform` maps PDF user space to the output space (the viewport's transform).
 * With `skipBackground`, an image covering most of the page is treated as a backdrop and dropped.
 */
export async function extractPageImages(
  page: PDFPageProxy,
  ops: OperatorList,
  transform: Matrix,
  pageWidth: number,
  pageHeight: number,
  skipBackground: boolean,
): Promise<PageImage[]> {
  const { OPS, Util } = pdfjsLib;
  const placements: { source: string | RawImage; ctm: Matrix }[] = [];
  const stack: Matrix[] = [];
  let ctm = transform;
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    switch (fn) {
      case OPS.save:
      case OPS.beginGroup:
        stack.push(ctm);
        break;
      case OPS.restore:
      case OPS.endGroup:
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (args[0]) ctm = Util.transform(ctm, args[0]);
        break;
      case OPS.transform:
        ctm = Util.transform(ctm, args);
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
        placements.push({ source: args[0], ctm });
        break;
    }
  });

  const images: PageImage[] = [];
  const seen = new Set<string>();
  for (const { source, ctm: m } of placements.slice(0, MAX_IMAGES_PER_PAGE)) {
    const box = clipToPage(unitSquareBox(m), pageWidth, pageHeight);
    if (!box) continue;
    if (skipBackground && box.width * box.height > pageWidth * pageHeight * BACKGROUND_COVERAGE) continue;
    // Some PDFs paint the same image twice in the same place.
    const key = `${typeof source === "string" ? source : "inline"}:${Math.round(box.x)}:${Math.round(box.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const image = typeof source === "string" ? await resolveImage(page, source) : source;
    if (!image?.width || !image.height) continue;
    try {
      const encoded = await encode(image, m, box);
      if (encoded) images.push(encoded);
    } catch (err) {
      console.warn("Skipping image that could not be read:", err);
    }
  }
  return images;
}
