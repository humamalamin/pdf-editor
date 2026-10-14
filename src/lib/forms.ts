import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  type PDFDocument,
  type PDFFont,
} from "pdf-lib";
import type { pdfjsLib } from "@/lib/pdfjs";

// Fillable AcroForm fields, read with pdf.js for display and written back with pdf-lib on export.

export type FormFieldKind = "text" | "checkbox" | "radio" | "select";

export type FormField = {
  id: string; // widget annotation id (one field name can have several widgets, e.g. radio buttons)
  page: number;
  name: string;
  kind: FormFieldKind;
  // Widget box in unscaled PDF points, top-left origin (same space as annotations)
  x: number;
  y: number;
  width: number;
  height: number;
  readOnly: boolean;
  multiline: boolean;
  password: boolean;
  maxLength: number | null;
  align: "left" | "center" | "right";
  fontSize: number; // 0 = auto-size
  onValue: string; // checkbox/radio: the value this widget represents when on
  options: { value: string; label: string }[]; // select
  // The page canvas skips form widgets (we draw the controls), so their frame is redrawn in CSS
  borderColor: string | null;
  backgroundColor: string | null;
  borderWidth: number;
};

/** Field values keyed by field name: text, the "on" value of a checked box/radio, or "Off". */
export type FormValues = Record<string, string>;

export const OFF = "Off";

type WidgetData = {
  subtype: string;
  id: string;
  fieldType?: string;
  fieldName?: string;
  fieldValue?: string | string[] | null;
  rect: number[];
  readOnly?: boolean;
  hidden?: boolean;
  multiLine?: boolean;
  password?: boolean;
  maxLen?: number;
  textAlignment?: number | null;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  exportValue?: string;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  defaultAppearanceData?: { fontSize?: number };
  borderColor?: ArrayLike<number> | null;
  backgroundColor?: ArrayLike<number> | null;
  borderStyle?: { width?: number };
};

const cssColor = (c: ArrayLike<number> | null | undefined) =>
  c && c.length === 3 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : null;

const ALIGNMENTS = ["left", "center", "right"] as const;

export async function loadFormFields(pdf: pdfjsLib.PDFDocumentProxy) {
  const fields: FormField[] = [];
  const values: FormValues = {};

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const [viewLeft, , , viewTop] = page.view;
    const widgets = (await page.getAnnotations({ intent: "display" })) as WidgetData[];

    for (const w of widgets) {
      if (w.subtype !== "Widget" || !w.fieldName || w.hidden) continue;

      let kind: FormFieldKind | null = null;
      if (w.fieldType === "Tx") kind = "text";
      else if (w.fieldType === "Ch") kind = "select";
      else if (w.fieldType === "Btn" && w.checkBox) kind = "checkbox";
      else if (w.fieldType === "Btn" && w.radioButton) kind = "radio";
      if (!kind) continue; // push buttons, signature fields, …

      const [x1, y1, x2, y2] = w.rect;
      const onValue = (kind === "radio" ? w.buttonValue : w.exportValue) ?? "Yes";
      fields.push({
        id: w.id,
        page: pageNumber,
        name: w.fieldName,
        kind,
        x: Math.min(x1, x2) - viewLeft,
        y: viewTop - Math.max(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        readOnly: !!w.readOnly,
        multiline: !!w.multiLine,
        password: !!w.password,
        maxLength: w.maxLen || null,
        align: ALIGNMENTS[w.textAlignment ?? 0] ?? "left",
        fontSize: w.defaultAppearanceData?.fontSize ?? 0,
        onValue,
        options: (w.options ?? []).map((o) => ({ value: o.exportValue, label: o.displayValue })),
        borderColor: cssColor(w.borderColor),
        backgroundColor: cssColor(w.backgroundColor),
        borderWidth: w.borderColor ? (w.borderStyle?.width ?? 1) : 0,
      });

      if (!(w.fieldName in values)) {
        const raw = Array.isArray(w.fieldValue) ? w.fieldValue[0] : w.fieldValue;
        values[w.fieldName] = kind === "checkbox" || kind === "radio" ? raw || OFF : raw ?? "";
      }
    }
  }

  return { fields, values };
}

const AUTO_FONT_RATIO = 0.65; // auto-sized single-line text: share of the field height
const MAX_AUTO_FONT = 14;
const MULTILINE_FONT = 11;

/**
 * Font size used both on screen and in the exported appearance, so they match. "Auto" (0) and
 * oversized multi-line sizes (some generators size empty boxes to their full height) get a
 * readable fixed size instead of each renderer's own guess.
 */
export function fieldFontSize(f: FormField) {
  if (f.multiline) return f.fontSize > 0 && f.fontSize <= f.height / 2.5 ? f.fontSize : MULTILINE_FONT;
  return f.fontSize > 0 ? f.fontSize : Math.min(MAX_AUTO_FONT, f.height * AUTO_FONT_RATIO);
}

const isLatin1 = (s: string) => [...s].every((ch) => ch.codePointAt(0)! <= 0xff);

/**
 * Writes changed field values into the pdf-lib document and regenerates their appearances.
 * Fields pdf-lib can't handle are skipped (logged) rather than failing the whole export.
 */
export async function applyFormValues(
  pdfDoc: PDFDocument,
  fields: FormField[],
  values: FormValues,
  changed: string[],
  loadUnicodeFont: () => Promise<ArrayBuffer>
) {
  if (changed.length === 0) return;
  const form = pdfDoc.getForm();

  for (const name of changed) {
    const value = values[name];
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField) {
        const widget = fields.find((f) => f.name === name);
        if (widget) field.setFontSize(Math.round(fieldFontSize(widget) * 10) / 10);
        field.setText(value || undefined);
      } else if (field instanceof PDFCheckBox) {
        if (value === OFF) field.uncheck();
        else field.check();
      } else if (field instanceof PDFRadioGroup) {
        if (value === OFF) {
          field.clear();
        } else {
          // With an /Opt array the widgets' on-states are indexes ("0", "1", …) that pdf.js
          // reports, while pdf-lib selects by the option label at that index
          const options = field.getOptions();
          field.select(options.includes(value) ? value : (options[Number(value)] ?? value));
        }
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        // pdf-lib selects by the option's display text, pdf.js reports the export value
        const option = fields.find((f) => f.name === name)?.options.find((o) => o.value === value);
        if (!value) field.clear();
        else field.select(option?.label ?? value);
      }
    } catch (e) {
      console.warn(`Could not fill form field "${name}"`, e);
    }
  }

  // Helvetica (no embedding) covers Latin-1; anything else needs a Unicode font. It is embedded
  // without subsetting so the field stays editable in other PDF readers.
  const texts = changed.map((n) => values[n] ?? "");
  let font: PDFFont;
  if (texts.every(isLatin1)) {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  } else {
    font = await pdfDoc.embedFont(await loadUnicodeFont(), { subset: false });
  }
  form.updateFieldAppearances(font);
}
