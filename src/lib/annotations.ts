import { BlendMode, LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  FONTS,
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
import { applyFormValues, type FormField, type FormValues } from "@/lib/forms";
import { SHAPE_DEFAULTS, SYMBOL_BOX, SYMBOL_PATHS, isRedaction, type ShapeKind, type ShapeStyle } from "@/lib/shapes";
import { applyRedactions, removeUnreachableObjects } from "@/lib/redact";
import { inkPointsForBox, smoothPath, type InkData } from "@/lib/ink";

// All geometry is stored in unscaled PDF points (top-left origin); multiply by `scale` to render.
export type Annotation = {
  id: string;
  type: "text" | "image" | "shape";
  page: number;
  x: number;
  y: number;
  content: string; // text string or data URL for image
  width?: number; // text: undefined = grow with content (no wrapping); set = wrap at this width
  height?: number;
  format?: TextFormat; // text only
  shape?: ShapeKind; // shape only
  style?: ShapeStyle; // shape only
  x2?: number; // line only: end point (x, y is the start point)
  y2?: number;
  ink?: InkData; // pen stroke only
};

export const formatOf = (ann: Annotation): TextFormat => ann.format ?? DEFAULT_TEXT_FORMAT;

export const styleOf = (ann: Annotation): ShapeStyle => ann.style ?? SHAPE_DEFAULTS[ann.shape ?? "rect"];

export const textBoxWidth = (ann: Annotation) =>
  ann.width ?? Math.max(MIN_TEXT_WIDTH, measureTextWidth(ann.content, formatOf(ann)) + 2);

/**
 * Draws the annotations (and filled-in form values) onto a copy of the PDF. Returns null when the
 * user declines to save text containing characters the chosen fonts can't render.
 */
export async function exportAnnotatedPdf(
  pdfBytes: ArrayBuffer,
  annotations: Annotation[],
  form?: { fields: FormField[]; values: FormValues; changed: string[] }
) {
  const pdfDocLib = await PDFDocument.load(pdfBytes);
  pdfDocLib.registerFontkit(fontkit);

  if (form) {
    await applyFormValues(pdfDocLib, form.fields, form.values, form.changed, () =>
      fetch(FONTS.sans.files.regular).then((res) => res.arrayBuffer())
    );
  }

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

  // Redacted pages become images. Annotations stacked below a redaction on its page are drawn
  // first so they end up inside the image too (otherwise text placed under a redaction box would
  // still be in the file); everything else is drawn afterwards as crisp vectors.
  const redactions = annotations.filter((ann) => ann.type === "shape" && isRedaction(ann.shape));
  const lastRedaction = new Map<number, number>();
  annotations.forEach((ann, i) => {
    if (redactions.includes(ann)) lastRedaction.set(ann.page, i);
  });
  const beneath = annotations.filter((ann, i) => i < (lastRedaction.get(ann.page) ?? -1) && !redactions.includes(ann));
  const onTop = annotations.filter((ann) => !beneath.includes(ann));

  await drawAnnotations(pdfDocLib, beneath, fonts);
  await applyRedactions(pdfDocLib, redactions);
  await drawAnnotations(pdfDocLib, onTop, fonts);
  if (redactions.length > 0) removeUnreachableObjects(pdfDocLib);

  return pdfDocLib.save();
}

async function drawAnnotations(pdfDocLib: PDFDocument, annotations: Annotation[], fonts: Map<string, PDFFont>) {
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
    } else if (ann.type === "shape") {
      drawShape(pdfPage, ann, left, top);
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
}

function drawShape(pdfPage: PDFPage, ann: Annotation, left: number, top: number) {
  const kind = ann.shape ?? "rect";
  const style = styleOf(ann);
  const stroke = rgb(...hexToRgb01(style.stroke));
  const fill = style.fill ? rgb(...hexToRgb01(style.fill)) : undefined;
  const w = ann.width ?? 0;
  const h = ann.height ?? 0;
  // Strokes are drawn inside the box, matching the SVG rendering in the editor
  const sw = style.strokeWidth;

  switch (kind) {
    case "whiteout":
    case "redact":
    case "highlight":
      pdfPage.drawRectangle({
        x: left,
        y: top - h,
        width: w,
        height: h,
        color: fill ?? stroke,
        opacity: style.opacity,
        // Multiply keeps the text under a highlight dark instead of washing it out
        blendMode: kind === "highlight" ? BlendMode.Multiply : undefined,
      });
      break;
    case "rect":
      pdfPage.drawRectangle({
        x: left + sw / 2,
        y: top - h + sw / 2,
        width: Math.max(0, w - sw),
        height: Math.max(0, h - sw),
        borderColor: stroke,
        borderWidth: sw,
        color: fill,
        opacity: style.opacity,
        borderOpacity: style.opacity,
      });
      break;
    case "ellipse":
      pdfPage.drawEllipse({
        x: left + w / 2,
        y: top - h / 2,
        xScale: Math.max(0, (w - sw) / 2),
        yScale: Math.max(0, (h - sw) / 2),
        borderColor: stroke,
        borderWidth: sw,
        color: fill,
        opacity: style.opacity,
        borderOpacity: style.opacity,
      });
      break;
    case "line":
      pdfPage.drawLine({
        start: { x: left, y: top },
        end: { x: left + ((ann.x2 ?? ann.x) - ann.x), y: top - ((ann.y2 ?? ann.y) - ann.y) },
        thickness: sw,
        color: stroke,
        opacity: style.opacity,
        lineCap: LineCapStyle.Round,
      });
      break;
    case "ink": {
      if (!ann.ink) break;
      // drawSvgPath uses a y-down path from (x, y), like the SVG in the editor
      pdfPage.drawSvgPath(smoothPath(inkPointsForBox(ann.ink, w, h)), {
        x: left,
        y: top,
        borderColor: stroke,
        borderWidth: sw,
        borderLineCap: LineCapStyle.Round,
        borderOpacity: style.opacity,
      });
      break;
    }
    case "check":
    case "cross": {
      // drawSvgPath scales the line width together with the path
      const scale = w / SYMBOL_BOX;
      pdfPage.drawSvgPath(SYMBOL_PATHS[kind], {
        x: left,
        y: top,
        scale,
        borderColor: stroke,
        borderWidth: sw / scale,
        borderLineCap: LineCapStyle.Round,
        borderOpacity: style.opacity,
      });
      break;
    }
  }
}
