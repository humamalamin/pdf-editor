export const siteConfig = {
  name: "PDFEditor",
  title: "PDFEditor - Private Browser-Based PDF Editor",
  description:
    "Edit, annotate, sign, organize, compress, merge, and split PDF files securely in your browser without uploading documents to a server.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ogImage: "/cover.jpg",
  keywords: [
    "PDF editor",
    "edit PDF online",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "organize PDF pages",
    "sign PDF",
    "private PDF editor",
    "client-side PDF editor",
  ],
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString();
}
