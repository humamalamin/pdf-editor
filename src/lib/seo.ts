import type { Metadata } from "next";
import { ogLocales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { toolPath, type ToolId } from "@/lib/tools";

export const siteConfig = {
  name: "PDFEditor",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://pdfeditor.my.id",
  ogImage: "/cover.jpg",
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString();
}

/** hreflang links pointing at the same tool in every language. */
export function languageAlternates(toolId: ToolId) {
  return {
    en: absoluteUrl(toolPath(toolId, "en")),
    id: absoluteUrl(toolPath(toolId, "id")),
    "x-default": absoluteUrl(toolPath(toolId, "en")),
  };
}

/** Site-wide defaults for a language's root layout. */
export function rootMetadata(locale: Locale): Metadata {
  const { seo } = getDictionary(locale);
  const home = absoluteUrl(toolPath("edit", locale));
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: seo.title, template: `%s | ${siteConfig.name}` },
    description: seo.description,
    keywords: seo.keywords,
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    publisher: siteConfig.name,
    openGraph: {
      type: "website",
      locale: ogLocales[locale],
      url: home,
      siteName: siteConfig.name,
      title: seo.title,
      description: seo.description,
      images: [{ url: siteConfig.ogImage, width: 1024, height: 1024, alt: seo.ogImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [siteConfig.ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    category: "technology",
  };
}

export function toolMetadata(toolId: ToolId, locale: Locale): Metadata {
  const tool = getDictionary(locale).tools[toolId];
  const url = absoluteUrl(toolPath(toolId, locale));
  return {
    // The home page title already contains the site name.
    title: toolId === "edit" ? { absolute: tool.title } : tool.title,
    description: tool.description,
    alternates: { canonical: url, languages: languageAlternates(toolId) },
    openGraph: { title: tool.title, description: tool.description, url, locale: ogLocales[locale] },
  };
}
