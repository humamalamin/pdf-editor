import type { Locale } from "@/i18n/config";
import { en, type Dictionary } from "./en";
import { id } from "./id";

const dictionaries: Record<Locale, Dictionary> = { en, id };

/** Server-side lookup. Pass the result to client components as a prop so only one language ships. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
