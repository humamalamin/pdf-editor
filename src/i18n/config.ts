export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = { en: "English", id: "Bahasa Indonesia" };
export const ogLocales: Record<Locale, string> = { en: "en_US", id: "id_ID" };

/** Replaces `{name}` placeholders with values. */
export function format(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Picks the singular or plural template and fills in `{count}`. */
export function plural(count: number, one: string, other: string, vars: Record<string, string | number> = {}) {
  return format(count === 1 ? one : other, { count, ...vars });
}
