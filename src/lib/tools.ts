import type { Locale } from "@/i18n/config";

export const toolIds = [
  "edit",
  "organize",
  "compress",
  "merge",
  "split",
  "pdf-to-image",
  "image-to-pdf",
  "watermark",
  "protect",
] as const;

export type ToolId = (typeof toolIds)[number];

/** Page path of each tool per language. English keeps the original URLs. */
const toolPaths: Record<ToolId, Record<Locale, string>> = {
  edit: { en: "/", id: "/id" },
  organize: { en: "/organize-pdf", id: "/id/atur-pdf" },
  compress: { en: "/compress-pdf", id: "/id/kompres-pdf" },
  merge: { en: "/merge-pdf", id: "/id/gabung-pdf" },
  split: { en: "/split-pdf", id: "/id/pisah-pdf" },
  "pdf-to-image": { en: "/pdf-to-jpg", id: "/id/pdf-ke-jpg" },
  "image-to-pdf": { en: "/jpg-to-pdf", id: "/id/jpg-ke-pdf" },
  watermark: { en: "/watermark-pdf", id: "/id/watermark-pdf" },
  protect: { en: "/protect-pdf", id: "/id/kunci-pdf" },
};

export function toolPath(id: ToolId, locale: Locale) {
  return toolPaths[id][locale];
}

/** Last URL segment of a tool page, used as the `[tool]` route param. */
export function toolSlug(id: ToolId, locale: Locale) {
  return toolPath(id, locale).split("/").pop() ?? "";
}

export function toolBySlug(slug: string, locale: Locale): ToolId | undefined {
  return toolIds.find((id) => id !== "edit" && toolSlug(id, locale) === slug);
}
