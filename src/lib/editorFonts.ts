import type { CSSProperties } from "react";

// The same TTF files back both the on-screen @font-face rules (globals.css) and the fonts
// embedded into the exported PDF, so what the user sees is what gets saved.
export const FONTS = {
  sans: {
    label: "Sans",
    css: "PdfEditorSans",
    files: {
      regular: "/fonts/NotoSans-Regular.ttf",
      bold: "/fonts/NotoSans-Bold.ttf",
      italic: "/fonts/NotoSans-Italic.ttf",
      boldItalic: "/fonts/NotoSans-BoldItalic.ttf",
    },
  },
  serif: {
    label: "Serif",
    css: "PdfEditorSerif",
    files: {
      regular: "/fonts/NotoSerif-Regular.ttf",
      bold: "/fonts/NotoSerif-Bold.ttf",
      italic: "/fonts/NotoSerif-Italic.ttf",
      boldItalic: "/fonts/NotoSerif-BoldItalic.ttf",
    },
  },
  mono: {
    label: "Mono",
    css: "PdfEditorMono",
    files: {
      regular: "/fonts/LiberationMono-Regular.ttf",
      bold: "/fonts/LiberationMono-Bold.ttf",
      italic: "/fonts/LiberationMono-Italic.ttf",
      boldItalic: "/fonts/LiberationMono-BoldItalic.ttf",
    },
  },
} as const;

export type FontKey = keyof typeof FONTS;
export type TextAlign = "left" | "center" | "right";

export type TextFormat = {
  fontSize: number;
  fontFamily: FontKey;
  bold: boolean;
  italic: boolean;
  color: string; // #rrggbb
  align: TextAlign;
};

export const DEFAULT_TEXT_FORMAT: TextFormat = {
  fontSize: 16,
  fontFamily: "sans",
  bold: false,
  italic: false,
  color: "#000000",
  align: "left",
};

export const LINE_HEIGHT = 1.2;
export const MIN_TEXT_WIDTH = 24;

export const fontFileFor = (f: TextFormat) => {
  const { files } = FONTS[f.fontFamily];
  if (f.bold && f.italic) return files.boldItalic;
  if (f.bold) return files.bold;
  if (f.italic) return files.italic;
  return files.regular;
};

// CSS `font` shorthand, used for canvas measuring and document.fonts.load
export const cssFont = (f: TextFormat, size: number) =>
  `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${size}px "${FONTS[f.fontFamily].css}"`;

let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = () => (measureCtx ??= document.createElement("canvas").getContext("2d"));

export const measureTextWidth = (text: string, f: TextFormat) => {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * f.fontSize * 0.6;
  ctx.font = cssFont(f, f.fontSize);
  return Math.max(...text.split("\n").map((line) => ctx.measureText(line).width));
};

// Distance from the top of the first line box to its baseline, as a fraction of the font size.
// Uses the ascent/descent the browser itself lays out with (half-leading + ascent).
export const firstBaseline = (f: TextFormat) => {
  const ctx = getMeasureCtx();
  let ascent = 1.069;
  let descent = 0.293;
  if (ctx) {
    ctx.font = cssFont(f, 100);
    const m = ctx.measureText("Hg");
    if (m.fontBoundingBoxAscent) {
      ascent = m.fontBoundingBoxAscent / 100;
      descent = m.fontBoundingBoxDescent / 100;
    }
  }
  return (LINE_HEIGHT - (ascent + descent)) / 2 + ascent;
};

// Greedy word wrap mirroring CSS `white-space: pre-wrap; overflow-wrap: anywhere`.
export const wrapText = (text: string, maxWidth: number, measure: (s: string) => number) => {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(?<=\s)/)) {
      if (measure(line + word.trimEnd()) <= maxWidth) {
        line += word;
        continue;
      }
      if (line) lines.push(line.trimEnd());
      line = "";
      for (const ch of word) {
        if (line && measure(line + ch) > maxWidth && ch.trim()) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
};

export const textCss = (f: TextFormat, scale: number, wrap: boolean): CSSProperties => ({
  fontFamily: `"${FONTS[f.fontFamily].css}", sans-serif`,
  fontSize: `${f.fontSize * scale}px`,
  fontWeight: f.bold ? 700 : 400,
  fontStyle: f.italic ? "italic" : "normal",
  color: f.color,
  textAlign: f.align,
  lineHeight: LINE_HEIGHT,
  whiteSpace: wrap ? "pre-wrap" : "pre",
  overflowWrap: wrap ? "anywhere" : "normal",
});

export const hexToRgb01 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};
