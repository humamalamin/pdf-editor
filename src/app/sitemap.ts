import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { absoluteUrl, languageAlternates, siteConfig } from "@/lib/seo";
import { toolIds, toolPath } from "@/lib/tools";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return toolIds.flatMap((id) =>
    locales.map((locale) => ({
      url: absoluteUrl(toolPath(id, locale)),
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: id === "edit" ? 1 : 0.8,
      alternates: { languages: languageAlternates(id) },
      images: [absoluteUrl(siteConfig.ogImage)],
    })),
  );
}
