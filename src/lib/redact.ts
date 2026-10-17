import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import { pdfjsLib } from "@/lib/pdfjs";
import { styleOf, type Annotation } from "@/lib/annotations";

/** Render resolution for redacted pages (150 DPI): sharp enough to read and print. */
const RASTER_SCALE = 150 / 72;
const JPEG_QUALITY = 0.9;

/**
 * Real redaction: every page that has a redaction box is replaced by a picture of itself with the
 * boxes painted in, so the covered text, images and form values are gone from the file, not just
 * hidden. Other pages are untouched.
 *
 * Box coordinates are PDF points with a top-left origin in the page's displayed orientation (what
 * the editor uses); the rebuilt page is unrotated with its origin at 0,0, so later drawing with the
 * same coordinates still lines up.
 */
export async function applyRedactions(doc: PDFDocument, redactions: Annotation[]) {
  const pageNumbers = [...new Set(redactions.map((r) => r.page))].sort((a, b) => a - b);
  if (pageNumbers.length === 0) return;
  const pages = doc.getPages();

  // Form fields with a widget on a redacted page would keep their values in the file
  removeFieldsOnPages(doc, pageNumbers.map((n) => pages[n - 1]));

  // Render from the current state so filled-in form values and other annotations are in the image
  const bytes = await doc.save();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    for (const pageNumber of pageNumbers) {
      const page = await pdf.getPage(pageNumber);
      const view = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RASTER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      for (const r of redactions.filter((a) => a.page === pageNumber)) {
        const style = styleOf(r);
        ctx.fillStyle = style.fill ?? style.stroke;
        ctx.fillRect(
          r.x * RASTER_SCALE,
          r.y * RASTER_SCALE,
          (r.width ?? 0) * RASTER_SCALE,
          (r.height ?? 0) * RASTER_SCALE,
        );
      }

      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode page"))), "image/jpeg", JPEG_QUALITY),
      );
      canvas.width = 0;
      canvas.height = 0;
      const image = await doc.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      replaceWithImage(doc, pages[pageNumber - 1], image, view.width, view.height);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  // Tagged-PDF structure can carry copies of the text (alt text, ActualText) and points at the
  // old page content, so it can't survive a redaction.
  doc.catalog.delete(PDFName.of("StructTreeRoot"));
  doc.catalog.delete(PDFName.of("MarkInfo"));
}

/**
 * Keeps the page object (outlines and links that point at it stay valid) but swaps everything
 * it draws for a single image.
 */
function replaceWithImage(
  doc: PDFDocument,
  page: PDFPage,
  image: Awaited<ReturnType<PDFDocument["embedJpg"]>>,
  width: number,
  height: number,
) {
  const node = page.node;
  for (const key of ["Contents", "Annots", "BleedBox", "TrimBox", "ArtBox", "Thumb", "PieceInfo", "StructParents", "Group"]) {
    node.delete(PDFName.of(key));
  }
  // Set (not delete) the inheritable entries, so values from the parent Pages node don't apply
  const box = doc.context.obj([0, 0, width, height]);
  node.set(PDFName.of("MediaBox"), box);
  node.set(PDFName.of("CropBox"), box);
  node.set(PDFName.of("Rotate"), doc.context.obj(0));
  // pdf-lib only creates these sub-dictionaries when it first normalizes a page, which has
  // already happened, so provide them up front
  node.set(PDFName.of("Resources"), doc.context.obj({ Font: {}, XObject: {}, ExtGState: {} }));
  page.drawImage(image, { x: 0, y: 0, width, height });
}

function removeFieldsOnPages(doc: PDFDocument, pages: PDFPage[]) {
  const annotRefs = new Set<string>();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      if (ref instanceof PDFRef) annotRefs.add(ref.tag);
    }
  }
  if (annotRefs.size === 0) return;

  const form = doc.getForm();
  for (const field of form.getFields()) {
    const onRedactedPage = field.acroField.getWidgets().some((widget) => {
      const ref = doc.context.getObjectRef(widget.dict);
      return ref !== undefined && annotRefs.has(ref.tag);
    });
    if (!onRedactedPage) continue;
    try {
      form.removeField(field);
    } catch (err) {
      // The page image still shows the field; only its interactive copy would survive
      console.warn("Could not remove form field", field.getName(), err);
    }
  }
}

/**
 * pdf-lib writes every object it has loaded, even ones nothing refers to any more. Without this,
 * the old page content (the redacted text) would still be in the saved file. Call it right before
 * the final save.
 */
export function removeUnreachableObjects(doc: PDFDocument) {
  const context = doc.context;
  const reachable = new Set<string>();
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  const stack: PDFObject[] = [Root, Info, Encrypt, ID].filter((o): o is PDFObject => o !== undefined);

  while (stack.length > 0) {
    const obj = stack.pop()!;
    if (obj instanceof PDFRef) {
      if (reachable.has(obj.tag)) continue;
      reachable.add(obj.tag);
      const target = context.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) stack.push(value);
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) stack.push(obj.get(i));
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }

  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref.tag)) context.delete(ref);
  }
}
