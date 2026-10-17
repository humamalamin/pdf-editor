"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export default function PrivacyNote({ className }: Readonly<{ className?: string }>) {
  const { t } = useI18n();
  return (
    <p
      className={cn(
        "mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        className
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t.privacy.note}
    </p>
  );
}
