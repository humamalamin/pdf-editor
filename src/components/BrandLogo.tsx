import Link from "next/link";
import { cn } from "@/lib/utils";

/** Document mark with a marker stripe plus the "pdfeditor.my.id" wordmark. */
export default function BrandLogo({
  href,
  className,
  compact = false,
}: Readonly<{ href: string; className?: string; compact?: boolean }>) {
  return (
    <Link href={href} aria-label="pdfeditor.my.id" className={cn("flex shrink-0 items-center gap-2.5 text-ink", className)}>
      <svg width="24" height="28" viewBox="0 0 28 32" fill="none" aria-hidden="true">
        <path d="M2 2h16l8 8v20H2z" className="fill-surface stroke-ink" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 2v8h8" className="stroke-ink" strokeWidth="2" strokeLinejoin="round" />
        <rect x="6" y="17" width="16" height="5" className="fill-marker" />
        <path d="M6 26h11" className="stroke-ink" strokeWidth="2" />
      </svg>
      <span className={cn("text-lg font-bold tracking-[-0.02em] sm:text-xl", compact && "hidden sm:inline")}>
        pdfeditor<span className="font-mono text-sm font-normal text-muted sm:text-[15px]">.my.id</span>
      </span>
    </Link>
  );
}
