import type { MetadataRoute } from "next";
import { absoluteUrl, siteConfig } from "@/lib/seo";
import { toolList } from "@/lib/tools";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return toolList.map((tool) => ({
    url: absoluteUrl(tool.path),
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: tool.path === "/" ? 1 : 0.8,
    images: [absoluteUrl(siteConfig.ogImage)],
  }));
}
