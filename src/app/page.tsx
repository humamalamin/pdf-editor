import type { Metadata } from "next";
import PdfEditorApp from "@/components/PdfEditorApp";
import { absoluteUrl, siteConfig } from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    absolute: siteConfig.title,
  },
  description: siteConfig.description,
  alternates: {
    canonical: absoluteUrl("/"),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  url: absoluteUrl("/"),
  description: siteConfig.description,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript and a modern web browser",
  featureList: [
    "Edit PDF files in the browser",
    "Annotate PDF documents",
    "Add image signatures",
    "Organize PDF pages",
    "Compress PDF files",
    "Merge PDF files",
    "Split PDF files",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <PdfEditorApp />
    </>
  );
}
