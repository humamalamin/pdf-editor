import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  DEFAULT_TEXT_FORMAT,
  LINE_HEIGHT,
  MIN_TEXT_WIDTH,
  cssFont,
  firstBaseline,
  fontFileFor,
  hexToRgb01,
  measureTextWidth,
  wrapText,
  type TextFormat,
} from "@/lib/editorFonts";

// All geometry is stored in unscaled PDF points (top-left origin); multiply by `scale` to render.
export type Annotation = {
  id: string;
  type: "text" | "image";
  page: number;
  x: number;
  y: number;
  content: string; // text string or data URL for image
  width?: number; // text: undefined = grow with content (no wrapping); set = wrap at this width
  height?: number;
  format?: TextFormat; // text only
};

export const formatOf = (ann: Annotation): TextFormat => ann.format ?? DEFAULT_TEXT_FORMAT;

export const textBoxWidth = (ann: Annotation) =>
  ann.width ?? Math.max(MIN_TEXT_WIDTH, measureTextWidth(ann.content, formatOf(ann)) + 2);

/**
 * Draws the annotations onto a copy of the PDF. Returns null when the user declines to save
 * text containing characters the chosen fonts can't render.
 */
export async function exportAnnotatedPdf(pdfBytes: ArrayBuffer, annotations: Annotation[]) {
  const pdfDocLib = await PDFDocument.load(pdfBytes);
  pdfDocLib.registerFontkit(fontkit);

  // Embed each font variant once; subsetting keeps only the glyphs actually used
  const textAnns = annotations.filter((ann) => ann.type === "text");
  const fonts = new Map<string, PDFFont>();
  for (const url of new Set(textAnns.map((ann) => fontFileFor(formatOf(ann))))) {
    const bytes = await fetch(url).then((res) => res.arrayBuffer());
    fonts.set(url, await pdfDocLib.embedFont(bytes, { subset: true }));
  }
  // Baselines are measured from the browser's own font metrics, so the fonts must be loaded
  await Promise.all(textAnns.map((ann) => document.fonts.load(cssFont(formatOf(ann), 16))));

  const unsupported = new Set(
    textAnns.flatMap((ann) => {
      const supported = new Set(fonts.get(fontFileFor(formatOf(ann)))!.getCharacterSet());
      return [...ann.content].filter((ch) => ch !== "\n" && !supported.has(ch.codePointAt(0)!));
    })
  );
  if (
    unsupported.size > 0 &&
    !confirm(
      `These characters aren't supported by the font and will show as empty boxes: ${[...unsupported].join(" ")}\n\nSave anyway?`
    )
  ) {
    return null;
  }

  const pages = pdfDocLib.getPages();
  for (const ann of annotations) {
    const pdfPage = pages[ann.page - 1];
    // pdf.js renders the crop box; pdf-lib's origin is its bottom-left corner
    const box = pdfPage.getCropBox();
    const left = box.x + ann.x;
    const top = box.y + box.height - ann.y;

    if (ann.type === "text") {
      const format = formatOf(ann);
      const font = fonts.get(fontFileFor(format))!;
      const { fontSize } = format;
      const lineWidth = (s: string) => font.widthOfTextAtSize(s, fontSize);
      const lines = ann.width ? wrapText(ann.content, ann.width, lineWidth) : ann.content.split("\n");
      const boxWidth = textBoxWidth(ann);
      const alignFactor = { left: 0, center: 0.5, right: 1 }[format.align];
      const baseline = firstBaseline(format);

      lines.forEach((line, i) => {
        pdfPage.drawText(line, {
          x: left + (boxWidth - lineWidth(line.trimEnd())) * alignFactor,
          y: top - fontSize * (baseline + i * LINE_HEIGHT),
          size: fontSize,
          font,
          color: rgb(...hexToRgb01(format.color)),
        });
      });
    } else if (ann.type === "image") {
      const embeddedImage = ann.content.includes("image/png")
        ? await pdfDocLib.embedPng(ann.content)
        : await pdfDocLib.embedJpg(ann.content);
      const imgWidth = ann.width || 100;
      const imgHeight = ann.height || 50;

      pdfPage.drawImage(embeddedImage, {
        x: left,
        y: top - imgHeight,
        width: imgWidth,
        height: imgHeight,
      });
    }
  }

  return pdfDocLib.save();
}
