// Signature helpers. Everything stays in the browser: signatures are PNG data URLs, and the
// "saved" list lives in localStorage on this device only.

export const SIGNATURE_FONTS = [
  { family: "Dancing Script", label: "Dancing Script" },
  { family: "Great Vibes", label: "Great Vibes" },
  { family: "Sacramento", label: "Sacramento" },
  { family: "Caveat", label: "Caveat" },
] as const;

export const SIGNATURE_COLORS = ["#000000", "#1e3a8a", "#2563eb"] as const;

const STORAGE_KEY = "pdfeditor.savedSignatures";
const MAX_SAVED = 6;
const MAX_UPLOAD_DIMENSION = 1200;
const TRIM_PADDING = 4;

/** Crops a canvas to its non-transparent pixels (plus a little padding). Null if it is empty. */
export function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = source.getContext("2d");
  if (!ctx || !source.width || !source.height) return null;
  const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);

  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;

  left = Math.max(0, left - TRIM_PADDING);
  top = Math.max(0, top - TRIM_PADDING);
  right = Math.min(width - 1, right + TRIM_PADDING);
  bottom = Math.min(height - 1, bottom + TRIM_PADDING);

  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(source, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Draws an uploaded image onto a canvas (downscaled if huge). With `removeBackground`, light
 * pixels fade to transparent so a photo/scan of ink on paper sits cleanly on the PDF.
 */
export function imageToCanvas(img: HTMLImageElement, removeBackground: boolean) {
  const ratio = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (removeBackground) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Fully clear above 225, fully keep below 160, blend in between for smooth edges
      const keep = Math.min(1, Math.max(0, (225 - luminance) / 65));
      data[i + 3] = Math.round(data[i + 3] * keep);
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

/** Renders a typed name in a handwriting font onto a transparent canvas. */
export async function renderTypedSignature(text: string, fontFamily: string, color: string) {
  const fontSize = 120;
  const font = `${fontSize}px "${fontFamily}"`;
  await document.fonts.load(font, text);

  const measureCtx = document.createElement("canvas").getContext("2d")!;
  measureCtx.font = font;
  const width = Math.ceil(measureCtx.measureText(text).width);

  // Generous margins: script fonts have swashes that overhang their advance width
  const canvas = document.createElement("canvas");
  canvas.width = width + fontSize;
  canvas.height = Math.ceil(fontSize * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, fontSize / 2, fontSize * 1.3);
  return canvas;
}

export function loadSavedSignatures(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeSavedSignatures(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked (private mode): saving is a convenience, so ignore
  }
}

/** Adds a signature to the front of the saved list (deduplicated, capped). Returns the new list. */
export function saveSignature(dataUrl: string) {
  const list = [dataUrl, ...loadSavedSignatures().filter((s) => s !== dataUrl)].slice(0, MAX_SAVED);
  writeSavedSignatures(list);
  return list;
}

export function removeSavedSignature(dataUrl: string) {
  const list = loadSavedSignatures().filter((s) => s !== dataUrl);
  writeSavedSignatures(list);
  return list;
}
