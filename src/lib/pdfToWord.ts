import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
  type ISectionOptions,
} from "docx";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";
import { ConvertCancelledError } from "@/lib/convert";
import { extractPageImages, type PageImage } from "@/lib/pdfImages";

// PDF has no paragraphs or headings, only glyphs placed at coordinates. This rebuilds a
// plausible structure from text positions and font sizes, so it suits text documents
// (letters, reports, articles) far better than tables or multi-column layouts. Images are
// placed inline between paragraphs, at the height they appear on the page.

export class NoTextError extends Error {
  constructor() {
    super("PDF has no selectable text");
  }
}

type Style = { bold: boolean; italic: boolean; size: number; font: string };

type Item = Style & { text: string; x: number; y: number; width: number };

type Line = { items: Item[]; x: number; right: number; y: number; size: number };

type Block = { lines: Line[]; gapBefore: number };

type PageLayout = {
  width: number;
  height: number;
  blocks: Block[];
  images: PageImage[];
  /** Content bounds in points, used for margins and indents. */
  left: number;
  right: number;
  top: number;
};

/** Images whose boxes share a band of the page, placed side by side in one paragraph. */
type ImageRow = { images: PageImage[]; top: number; bottom: number };

const TWIPS_PER_POINT = 20;
const PIXELS_PER_POINT = 96 / 72; // docx sizes images in 96-dpi pixels
const IMAGE_SPACING = 6; // points above and below an image paragraph
const BULLET = /^\s*([•●▪■◦○‣∙·\-–—*]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s/;

const FONT_FAMILIES: [RegExp, string][] = [
  [/times/i, "Times New Roman"],
  [/arial|helvetica/i, "Arial"],
  [/courier/i, "Courier New"],
  [/calibri/i, "Calibri"],
  [/cambria/i, "Cambria"],
  [/georgia/i, "Georgia"],
  [/verdana/i, "Verdana"],
  [/tahoma/i, "Tahoma"],
  [/garamond/i, "Garamond"],
  [/segoe/i, "Segoe UI"],
  [/roboto/i, "Roboto"],
  [/open ?sans/i, "Open Sans"],
];

/** Maps an embedded font such as "ABCDEF+TimesNewRomanPS-BoldMT" to a font Word users have. */
function wordFont(pdfName: string, genericFamily: string) {
  const name = pdfName.replace(/^[A-Z]{6}\+/, "");
  for (const [pattern, family] of FONT_FAMILIES) if (pattern.test(name)) return family;
  if (genericFamily === "serif") return "Times New Roman";
  if (genericFamily === "monospace") return "Courier New";
  return "Arial";
}

async function readPage(page: PDFPageProxy): Promise<PageLayout> {
  const viewport = page.getViewport({ scale: 1 });
  // Fonts reach commonObjs while the operator list is built; they carry the bold/italic flags.
  const ops = await page.getOperatorList();
  const content = await page.getTextContent();

  const styleCache = new Map<string, Omit<Style, "size">>();
  const styleOf = (fontName: string) => {
    let style = styleCache.get(fontName);
    if (!style) {
      const font = page.commonObjs.has(fontName) ? page.commonObjs.get(fontName) : null;
      const name: string = font?.name ?? "";
      style = {
        bold: !!(font?.bold || font?.black) || /bold|black|heavy|semibold|demi/i.test(name),
        italic: !!font?.italic || /italic|oblique/i.test(name),
        font: wordFont(name, content.styles[fontName]?.fontFamily ?? ""),
      };
      styleCache.set(fontName, style);
    }
    return style;
  };

  const lines: Line[] = [];
  let line: Line | null = null;
  let breakAfter = false;
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    if (raw.str === "") {
      if (raw.hasEOL) breakAfter = true;
      continue;
    }
    const [, , c, d, x, y] = pdfjsLib.Util.transform(viewport.transform, raw.transform);
    const size = Math.hypot(c, d);
    const item: Item = { ...styleOf(raw.fontName), size, text: raw.str, x, y, width: raw.width };

    // Content order is usually reading order, even across columns, so only start a new
    // line when the baseline moves or the PDF marked an end of line.
    const sameLine = line && !breakAfter && Math.abs(y - line.y) < Math.max(size, line.size) * 0.5;
    if (line && sameLine) {
      const gap = x - line.right;
      const last = line.items[line.items.length - 1];
      if (gap > size * 0.2 && !/\s$/.test(last.text) && !/^\s/.test(item.text)) item.text = ` ${item.text}`;
      line.items.push(item);
      line.right = Math.max(line.right, x + raw.width);
      line.size = Math.max(line.size, size);
    } else {
      line = { items: [item], x, right: x + raw.width, y, size };
      lines.push(line);
    }
    breakAfter = raw.hasEOL;
  }

  const textLines = lines.filter((l) => l.items.some((i) => i.text.trim() !== ""));
  const images = await extractPageImages(
    page,
    ops,
    viewport.transform,
    viewport.width,
    viewport.height,
    textLines.length > 0,
  );

  // Margins follow the text; a page with only images falls back to the images, then to 1 inch.
  const boxes = textLines.length
    ? textLines.map((l) => ({ left: l.x, right: l.right, top: l.y - l.size }))
    : images.map((i) => ({ left: i.x, right: i.x + i.width, top: i.y }));
  const top = Math.min(...boxes.map((b) => b.top), ...images.map((i) => i.y));
  return {
    width: viewport.width,
    height: viewport.height,
    blocks: groupParagraphs(textLines),
    images,
    left: boxes.length ? Math.min(...boxes.map((b) => b.left)) : 72,
    right: boxes.length ? Math.max(...boxes.map((b) => b.right)) : viewport.width - 72,
    top: Number.isFinite(top) ? top : 72,
  };
}

function groupParagraphs(lines: Line[]): Block[] {
  // Judge whether a line ends short against lines starting at the same x, not the whole
  // page, so a narrow column's lines are not each taken for the end of a paragraph.
  const columnRight = new Map(
    lines.map((line) => [
      line,
      Math.max(...lines.filter((l) => Math.abs(l.x - line.x) < line.size).map((l) => l.right)),
    ]),
  );
  const blocks: Block[] = [];
  let prev: Line | null = null;
  for (const line of lines) {
    const text = lineText(line);
    let newBlock = true;
    let gapBefore = 0;
    if (prev) {
      const gap = line.y - prev.y;
      gapBefore = Math.max(0, gap - prev.size * 1.2);
      const prevRight = columnRight.get(prev) ?? prev.right;
      const prevEndsShort = prev.right < prevRight - (prevRight - prev.x) * 0.15;
      const sizeChanged = Math.abs(line.size - prev.size) > prev.size * 0.15;
      const indented = line.x > prev.x + line.size;
      newBlock =
        gap < 0 || // moved up: next column or a jump in reading order
        gap > prev.size * 1.6 ||
        sizeChanged ||
        prevEndsShort ||
        indented ||
        BULLET.test(text);
    }
    if (newBlock) blocks.push({ lines: [line], gapBefore });
    else blocks[blocks.length - 1].lines.push(line);
    prev = line;
  }
  return blocks;
}

const lineText = (line: Line) => line.items.map((i) => i.text).join("");

/** The font size used for the most characters: everything noticeably larger is a heading. */
function bodySize(pages: PageLayout[]) {
  const counts = new Map<number, number>();
  for (const page of pages)
    for (const block of page.blocks)
      for (const line of block.lines)
        for (const item of line.items) {
          const size = Math.round(item.size);
          counts.set(size, (counts.get(size) ?? 0) + item.text.length);
        }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
}

function headingLevel(block: Block, body: number) {
  const size = Math.max(...block.lines.map((l) => l.size));
  const text = block.lines.map(lineText).join(" ").trim();
  if (text.length > 200) return undefined;
  if (size >= body * 1.5) return HeadingLevel.HEADING_1;
  if (size >= body * 1.25) return HeadingLevel.HEADING_2;
  const allBold = block.lines.every((l) => l.items.every((i) => i.bold || i.text.trim() === ""));
  if (size >= body * 1.1 && allBold && text.length < 120) return HeadingLevel.HEADING_3;
  return undefined;
}

/** Joins a paragraph's lines, merging adjacent items that share a style into one run. */
function toRuns(block: Block) {
  const runs: (Style & { text: string })[] = [];
  block.lines.forEach((line, index) => {
    line.items.forEach((item, i) => {
      let text = item.text;
      if (index > 0 && i === 0) {
        const last = runs[runs.length - 1];
        // Rejoin words hyphenated across lines ("docu-" + "ment"); otherwise lines meet at a space.
        if (last && /[a-zA-Z]-$/.test(last.text) && /^[a-z]/.test(text)) last.text = last.text.slice(0, -1);
        else if (last && !/\s$/.test(last.text)) text = ` ${text.trimStart()}`;
      }
      const size = Math.round(item.size * 2) / 2;
      const last = runs[runs.length - 1];
      if (last && last.bold === item.bold && last.italic === item.italic && last.size === size && last.font === item.font) {
        last.text += text;
      } else {
        runs.push({ bold: item.bold, italic: item.italic, size, font: item.font, text });
      }
    });
  });
  if (runs.length) {
    runs[0].text = runs[0].text.trimStart();
    runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
  }
  return runs.filter((r) => r.text !== "");
}

function toParagraph(block: Block, page: PageLayout, body: number, gapBefore: number) {
  const first = block.lines[0];
  const blockLeft = Math.min(...block.lines.map((l) => l.x));
  const blockRight = Math.max(...block.lines.map((l) => l.right));
  const center = (blockLeft + blockRight) / 2;
  const pageCenter = (page.left + page.right) / 2;
  const textWidth = page.right - page.left;
  const centered =
    blockRight - blockLeft < textWidth * 0.7 && Math.abs(center - pageCenter) < textWidth * 0.03 && blockLeft > page.left + 5;

  return new Paragraph({
    heading: headingLevel(block, body),
    alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    indent: centered
      ? undefined
      : {
          left: Math.round((blockLeft - page.left) * TWIPS_PER_POINT),
          firstLine: Math.max(0, Math.round((first.x - blockLeft) * TWIPS_PER_POINT)),
        },
    spacing: { before: Math.round(Math.min(gapBefore, 48) * TWIPS_PER_POINT), after: 0 },
    children: toRuns(block).map(
      (run) =>
        new TextRun({ text: run.text, bold: run.bold, italics: run.italic, size: run.size * 2, font: run.font }),
    ),
  });
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function margins(page: PageLayout) {
  const left = clamp(page.left, 18, 108);
  return {
    top: clamp(page.top, 18, 108),
    bottom: 36,
    left,
    // Ragged-right text rarely reaches the margin, so the left margin is the better guess.
    right: clamp(Math.min(page.width - page.right, page.left), 18, 108),
  };
}

function imageRows(images: PageImage[]): ImageRow[] {
  const rows: ImageRow[] = [];
  for (const image of [...images].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1);
    if (row && image.y < (row.top + row.bottom) / 2) {
      row.images.push(image);
      row.bottom = Math.max(row.bottom, image.y + image.height);
    } else {
      rows.push({ images: [image], top: image.y, bottom: image.y + image.height });
    }
  }
  for (const row of rows) row.images.sort((a, b) => a.x - b.x);
  return rows;
}

/** One paragraph of inline images, scaled down to fit inside the page margins if needed. */
function imageParagraph(row: ImageRow, page: PageLayout) {
  const m = margins(page);
  const availWidth = page.width - m.left - m.right;
  const availHeight = page.height - m.top - m.bottom - IMAGE_SPACING * 2;
  const rowLeft = row.images[0].x;
  const rowRight = Math.max(...row.images.map((i) => i.x + i.width));
  const scale = Math.min(1, availWidth / (rowRight - rowLeft), availHeight / (row.bottom - row.top));
  const rowWidth = (rowRight - rowLeft) * scale;
  const centered = row.images.length === 1 && Math.abs(rowLeft + rowRight - page.width) < page.width * 0.05;

  const children: (ImageRun | TextRun)[] = [];
  row.images.forEach((image, i) => {
    if (i > 0) children.push(new TextRun(" "));
    children.push(
      new ImageRun({
        type: image.type,
        data: image.data,
        transformation: {
          width: Math.max(1, Math.round(image.width * scale * PIXELS_PER_POINT)),
          height: Math.max(1, Math.round(image.height * scale * PIXELS_PER_POINT)),
        },
      }),
    );
  });
  return new Paragraph({
    alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    indent: centered
      ? undefined
      : { left: Math.round(clamp(rowLeft - m.left, 0, availWidth - rowWidth) * TWIPS_PER_POINT) },
    spacing: { before: IMAGE_SPACING * TWIPS_PER_POINT, after: IMAGE_SPACING * TWIPS_PER_POINT },
    children,
  });
}

/** Text paragraphs with each image row slotted in above the first paragraph that starts below it. */
function pageChildren(page: PageLayout, body: number) {
  const rows = imageRows(page.images);
  const children: Paragraph[] = [];
  let next = 0;
  let imageBottom: number | null = null;
  const placeRowsAbove = (y: number) => {
    for (; next < rows.length && rows[next].top < y; next++) {
      children.push(imageParagraph(rows[next], page));
      imageBottom = rows[next].bottom;
    }
  };
  for (const block of page.blocks) {
    const first = block.lines[0];
    const top = first.y - first.size;
    placeRowsAbove(top);
    // After an image, measure the gap from the image rather than from the previous text line.
    const gapBefore = imageBottom === null ? block.gapBefore : Math.max(0, top - imageBottom - IMAGE_SPACING);
    children.push(toParagraph(block, page, body, gapBefore));
    imageBottom = null;
  }
  placeRowsAbove(Infinity);
  return children.length ? children : [new Paragraph({})];
}

function toSection(page: PageLayout, body: number): ISectionOptions {
  const landscape = page.width > page.height;
  const m = margins(page);
  return {
    properties: {
      page: {
        // docx swaps width and height for landscape, so always pass portrait dimensions.
        size: {
          width: Math.round(Math.min(page.width, page.height) * TWIPS_PER_POINT),
          height: Math.round(Math.max(page.width, page.height) * TWIPS_PER_POINT),
          orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: {
          top: Math.round(m.top * TWIPS_PER_POINT),
          bottom: Math.round(m.bottom * TWIPS_PER_POINT),
          left: Math.round(m.left * TWIPS_PER_POINT),
          right: Math.round(m.right * TWIPS_PER_POINT),
        },
      },
    },
    children: pageChildren(page, body),
  };
}

/** Converts the given pages (1-based) to a .docx file, one Word section per PDF page. */
export async function pdfToWord(
  pdf: PDFDocumentProxy,
  pages: number[],
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Blob> {
  const layouts: PageLayout[] = [];
  for (const [index, pageNumber] of pages.entries()) {
    if (options.signal?.aborted) throw new ConvertCancelledError();
    options.onProgress?.(index, pages.length);
    const page = await pdf.getPage(pageNumber);
    try {
      layouts.push(await readPage(page));
    } finally {
      page.cleanup();
    }
  }
  if (layouts.every((p) => p.blocks.length === 0)) throw new NoTextError();
  options.onProgress?.(pages.length, pages.length);

  const body = bodySize(layouts);
  // Without this, Word's default headings turn blue and change size; keep the PDF's look.
  const plainHeading = { run: {} };
  const doc = new Document({
    styles: { default: { heading1: plainHeading, heading2: plainHeading, heading3: plainHeading } },
    sections: layouts.map((p) => toSection(p, body)),
  });
  return Packer.toBlob(doc);
}
