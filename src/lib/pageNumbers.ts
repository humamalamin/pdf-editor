import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { hexToRgb } from "@/lib/watermark";

export type NumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PageNumberOptions = {
  /** Text with `{n}` (page number) and optional `{total}` placeholders. */
  template: string;
  position: NumberPosition;
  /** Number shown on the first numbered page. */
  startAt: number;
  /** 1-based pages that get a number. Null means every page. */
  pages: Set<number> | null;
  /** Font size in points. */
  size: number;
  /** Distance from the page edge in points. */
  margin: number;
  /** #rrggbb */
  color: string;
};

// Helvetica's cap height is about 0.72 of the font size; used to keep top numbers inside the margin.
const CAP_HEIGHT = 0.72;

/** The numbered pages in order, so the n-th one shows `startAt + n`. */
function numberedPages(totalPages: number, pages: Set<number> | null) {
  return Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => !pages || pages.has(p));
}

/** Text for each page (1-based), or undefined for pages that are skipped. */
export function pageLabels(totalPages: number, options: Pick<PageNumberOptions, "template" | "startAt" | "pages">) {
  const numbered = numberedPages(totalPages, options.pages);
  const total = options.startAt + numbered.length - 1;
  const labels = new Map<number, string>();
  numbered.forEach((page, index) => {
    labels.set(
      page,
      options.template.replaceAll("{n}", String(options.startAt + index)).replaceAll("{total}", String(total)),
    );
  });
  return labels;
}

/**
 * Baseline-left point of the label in the page's displayed orientation
 * (origin bottom-left, as the reader sees it).
 */
function anchor(
  viewW: number,
  viewH: number,
  textWidth: number,
  { position, size, margin }: Pick<PageNumberOptions, "position" | "size" | "margin">,
) {
  const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const x =
    horizontal === "left" ? margin : horizontal === "right" ? viewW - margin - textWidth : (viewW - textWidth) / 2;
  const y = vertical === "bottom" ? margin : viewH - margin - size * CAP_HEIGHT;
  return { x, y };
}

/** Draws one label on a canvas showing the page as displayed, at `scale` pixels per point. */
export function drawPageNumberOnCanvas(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  scale: number,
  label: string,
  options: PageNumberOptions,
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.font = `${options.size}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = options.color;
  ctx.textBaseline = "alphabetic";
  const { x, y } = anchor(viewW, viewH, ctx.measureText(label).width, options);
  ctx.fillText(label, x, viewH - y);
  ctx.restore();
}

export async function addPageNumbers(buffer: ArrayBuffer, options: PageNumberOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { r, g, b } = hexToRgb(options.color);
  const labels = pageLabels(doc.getPageCount(), options);

  doc.getPages().forEach((page, index) => {
    const label = labels.get(index + 1);
    if (label === undefined) return;

    // Work in the visible area, and in the orientation the reader sees, so numbers
    // land in the right corner on cropped and rotated (e.g. scanned) pages.
    const box = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const viewW = sideways ? box.height : box.width;
    const viewH = sideways ? box.width : box.height;
    const { x: vx, y: vy } = anchor(viewW, viewH, font.widthOfTextAtSize(label, options.size), options);

    // Map the displayed point back to page space. /Rotate turns the page clockwise for display.
    const { w, h } = { w: box.width, h: box.height };
    const [ux, uy] =
      rotation === 90 ? [w - vy, vx] : rotation === 180 ? [w - vx, h - vy] : rotation === 270 ? [vy, h - vx] : [vx, vy];

    page.drawText(label, {
      x: box.x + ux,
      y: box.y + uy,
      size: options.size,
      font,
      color: rgb(r, g, b),
      // Counter the page rotation so the text reads upright.
      rotate: degrees(rotation),
    });
  });

  return doc.save();
}
