import type { Metadata } from "next";
import { rootMetadata } from "@/lib/seo";
import "../../globals.css";

export const metadata: Metadata = rootMetadata("id");

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
