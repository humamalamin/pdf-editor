import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n/dictionaries";
import { siteConfig } from "@/lib/seo";
import "./globals.css";

const en = getDictionary("en").notFound;
const id = getDictionary("id").notFound;

export const metadata: Metadata = {
  title: `404 - ${en.title} | ${siteConfig.name}`,
  robots: { index: false },
};

// There is no single root layout to inherit from, so this page shows both languages.
export default function GlobalNotFound() {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-8 bg-slate-50 p-6 text-center dark:bg-slate-950">
        <p className="text-6xl font-bold text-blue-600">404</p>
        <div className="grid gap-8 sm:grid-cols-2">
          <section>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{en.title}</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">{en.message}</p>
            <Link href="/" className="mt-4 inline-block font-semibold text-blue-600 hover:underline">
              {en.home}
            </Link>
          </section>
          <section lang="id">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{id.title}</h2>
            <p className="mt-2 text-slate-500 dark:text-slate-400">{id.message}</p>
            <Link href="/id" className="mt-4 inline-block font-semibold text-blue-600 hover:underline">
              {id.home}
            </Link>
          </section>
        </div>
      </body>
    </html>
  );
}
