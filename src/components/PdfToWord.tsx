"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileText, FileType, Download, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";
import { ConvertCancelledError } from "@/lib/convert";
import { NoTextError, pdfToWord } from "@/lib/pdfToWord";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import { useI18n } from "@/i18n/client";
import { format as fmt, plural } from "@/i18n/config";

export default function PdfToWord() {
  const { t } = useI18n();
  const tt = t.pdfToWord;
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const totalPages = pdf?.numPages ?? 0;

  useEffect(() => () => void pdf?.loadingTask.destroy(), [pdf]);

  const handleFile = async (selectedFile: File | undefined) => {
    if (!selectedFile || selectedFile.type !== "application/pdf") return;
    setError("");
    try {
      const doc = await pdfjsLib.getDocument({ data: await selectedFile.arrayBuffer() }).promise;
      setPdf(doc);
      setFile(selectedFile);
    } catch (err) {
      console.error("Failed to open PDF:", err);
      setPdf(null);
      setFile(null);
      setError(
        err instanceof Error && err.name === "PasswordException"
          ? t.common.passwordProtected
          : tt.openError,
      );
    }
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  const reset = () => {
    abortRef.current?.abort();
    setPdf(null);
    setFile(null);
    setError("");
  };

  const convert = async () => {
    if (!pdf || !file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProgress({ done: 0, total: totalPages });
    try {
      const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const blob = await pdfToWord(pdf, pages, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, "")}.docx`);
    } catch (err) {
      if (err instanceof ConvertCancelledError || controller.signal.aborted) return;
      if (err instanceof NoTextError) {
        setError(tt.noText);
        return;
      }
      console.error("Convert error:", err);
      setError(tt.failed);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-paper p-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[40px]">{tt.title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tt.subtitle}</p>
            <PrivacyNote />
          </div>
          {file && (
            <button onClick={reset} className="shrink-0 text-sm font-medium text-red-500 hover:text-red-600">
              {t.common.startOver}
            </button>
          )}
        </header>

        {!file || !pdf ? (
          <div
            {...dropProps}
            className={cn(
              "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 p-20 dark:border-slate-800 dark:bg-slate-900/30",
              isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20",
            )}
          >
            <label className="group flex cursor-pointer flex-col items-center">
              <div className="mb-6 rounded-full bg-white p-6 shadow-xl transition-transform group-hover:scale-110 dark:bg-slate-800">
                <FileType className="h-10 w-10 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{tt.emptyTitle}</h3>
              <p className="mt-2 max-w-sm text-center text-slate-500 dark:text-slate-400">{tt.emptyText}</p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-8 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700">
                {t.common.chooseFile}
              </div>
            </label>
            {error && <p className="mt-6 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">
                {formatSize(file.size)} · {plural(totalPages, t.common.pageCountOne, t.common.pageCountOther)}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  {tt.keepsTitle}
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tt.keepsText}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <Info className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  {tt.limitsTitle}
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tt.limitsText}</p>
              </div>
            </div>

            {error && (
              <p className="flex items-center justify-center gap-2 text-center text-sm text-red-500">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <div className="flex justify-center gap-3 py-4">
              {progress ? (
                <>
                  <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 font-semibold text-slate-700 shadow-2xl dark:bg-slate-800 dark:text-slate-200">
                    {fmt(tt.converting, { done: Math.min(progress.done + 1, progress.total), total: progress.total })}
                  </div>
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="rounded-2xl bg-slate-200 px-5 py-4 font-semibold text-slate-700 shadow-2xl hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                  >
                    {t.common.cancel}
                  </button>
                </>
              ) : (
                <button
                  onClick={convert}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-blue-600/30 transition-all hover:-translate-y-1 hover:bg-blue-700"
                >
                  <Download className="h-5 w-5" />
                  {tt.download}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
