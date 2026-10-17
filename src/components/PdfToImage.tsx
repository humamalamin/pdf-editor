"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileImage, FileText, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";
import { ConvertCancelledError, pdfToImages, type ImageFormat } from "@/lib/convert";
import { createZip } from "@/lib/zip";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";

const THUMB_SCALE = 0.3;

const RESOLUTIONS = [
  { dpi: 72, label: "Low", hint: "72 DPI, smallest" },
  { dpi: 150, label: "Medium", hint: "150 DPI, good for screens" },
  { dpi: 300, label: "High", hint: "300 DPI, good for print" },
] as const;

export default function PdfToImage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [format, setFormat] = useState<ImageFormat>("jpg");
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(90);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const totalPages = pdf?.numPages ?? 0;

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: THUMB_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) break;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const url = await new Promise<string | null>((resolve) =>
          canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/webp", 0.72),
        );
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          break;
        }
        urls.push(url ?? "");
        // Show thumbnails as they arrive instead of waiting for the whole document.
        if (i === 1 || i % 4 === 0 || i === pdf.numPages) setThumbnails([...urls]);
      }
    })().catch((err) => console.error("Thumbnail error:", err));
    return () => {
      cancelled = true;
      urls.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [pdf]);

  useEffect(() => () => void pdf?.destroy(), [pdf]);

  const handleFile = async (selectedFile: File | undefined) => {
    if (!selectedFile || selectedFile.type !== "application/pdf") return;
    setError("");
    setThumbnails([]);
    try {
      const doc = await pdfjsLib.getDocument({ data: await selectedFile.arrayBuffer() }).promise;
      setPdf(doc);
      setFile(selectedFile);
      setSelected(Array.from({ length: doc.numPages }, (_, i) => i + 1));
    } catch (err) {
      console.error("Failed to open PDF:", err);
      setPdf(null);
      setFile(null);
      setError(
        err instanceof Error && err.name === "PasswordException"
          ? "This PDF is password-protected. Unlock it first with the Protect tool."
          : "Could not open this PDF. It may be damaged.",
      );
    }
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  const togglePage = (pageNumber: number) => {
    setSelected((prev) =>
      prev.includes(pageNumber)
        ? prev.filter((p) => p !== pageNumber)
        : [...prev, pageNumber].sort((a, b) => a - b),
    );
  };

  const reset = () => {
    abortRef.current?.abort();
    setPdf(null);
    setFile(null);
    setThumbnails([]);
    setSelected([]);
    setError("");
  };

  const convert = async () => {
    if (!pdf || !file || selected.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProgress({ done: 0, total: selected.length });
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    try {
      const images = await pdfToImages(pdf, selected, {
        dpi,
        format,
        quality: quality / 100,
        baseName,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (images.length === 1) {
        downloadBlob(images[0].blob, images[0].name);
      } else {
        downloadBlob(await createZip(images), `${baseName}-${format}.zip`);
      }
    } catch (err) {
      if (err instanceof ConvertCancelledError || controller.signal.aborted) return;
      console.error("Convert error:", err);
      setError("Failed to convert the PDF. Try a lower resolution.");
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const formatLabel = format.toUpperCase();

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#f0f4f8] p-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">PDF to JPG</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Turn each PDF page into a JPG or PNG image.
            </p>
            <PrivacyNote />
          </div>
          {file && (
            <button onClick={reset} className="shrink-0 text-sm font-medium text-red-500 hover:text-red-600">
              Cancel / Start Over
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
                <FileImage className="h-10 w-10 text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Select a PDF to convert</h3>
              <p className="mt-2 max-w-sm text-center text-slate-500 dark:text-slate-400">
                Pick the pages you need, then download them as images.
              </p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-8 rounded-xl bg-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition-all hover:bg-pink-600">
                Choose File
              </div>
            </label>
            {error && <p className="mt-6 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-lg bg-pink-50 p-2 dark:bg-pink-900/20">
                  <FileText className="h-5 w-5 text-pink-500" />
                </div>
                <span className="max-w-[200px] truncate font-semibold text-slate-700 dark:text-slate-200" title={file.name}>
                  {file.name}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">
                  {formatSize(file.size)} · {totalPages} page{totalPages > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(Array.from({ length: totalPages }, (_, i) => i + 1))}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelected([])}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Format</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["jpg", "png"] as const).map((value) => (
                    <OptionButton key={value} active={format === value} onClick={() => setFormat(value)}>
                      {value.toUpperCase()}
                    </OptionButton>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Resolution</legend>
                <div className="grid grid-cols-3 gap-2">
                  {RESOLUTIONS.map((r) => (
                    <OptionButton key={r.dpi} active={dpi === r.dpi} onClick={() => setDpi(r.dpi)} title={r.hint}>
                      {r.label}
                    </OptionButton>
                  ))}
                </div>
              </fieldset>
              {format === "jpg" ? (
                <label className="block">
                  <span className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
                    Quality
                    <span className="font-medium text-slate-500">{quality}%</span>
                  </span>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="mt-3 w-full"
                  />
                </label>
              ) : (
                <p className="self-center text-xs text-slate-500 dark:text-slate-400">
                  PNG is lossless and sharper for text, but the files are larger.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => {
                const isSelected = selected.includes(pageNumber);
                const thumb = thumbnails[pageNumber - 1];
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => togglePage(pageNumber)}
                    aria-pressed={isSelected}
                    aria-label={`Page ${pageNumber}`}
                    className={cn(
                      "relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all",
                      isSelected
                        ? "border-pink-500 shadow-lg ring-4 ring-pink-500/10"
                        : "border-transparent bg-white shadow-sm hover:border-slate-300 dark:bg-slate-900",
                    )}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full bg-white object-contain" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-slate-50 text-2xl font-bold text-slate-300 dark:bg-slate-800">
                        {pageNumber}
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute right-2 top-2 rounded-full bg-white">
                        <CheckCircle2 className="h-6 w-6 text-pink-500" />
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-bold text-white",
                        isSelected ? "bg-pink-500" : "bg-slate-800/80",
                      )}
                    >
                      PAGE {pageNumber}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="flex items-center justify-center gap-2 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}

            <div className="pointer-events-none sticky bottom-6 flex justify-center gap-3 py-4">
              {progress ? (
                <>
                  <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-6 py-4 font-semibold text-slate-700 shadow-2xl dark:bg-slate-800 dark:text-slate-200">
                    Converting page {Math.min(progress.done + 1, progress.total)} of {progress.total}...
                  </div>
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="pointer-events-auto rounded-2xl bg-slate-200 px-5 py-4 font-semibold text-slate-700 shadow-2xl hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={convert}
                  disabled={selected.length === 0}
                  className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-pink-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-pink-600/30 transition-all hover:-translate-y-1 hover:bg-pink-700 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                >
                  <Download className="h-5 w-5" />
                  {selected.length === 1
                    ? `Download ${formatLabel}`
                    : `Download ${selected.length} ${formatLabel}s (ZIP)`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  title,
  children,
}: Readonly<{ active: boolean; onClick: () => void; title?: string; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-xl border-2 py-2 text-sm font-bold",
        active
          ? "border-pink-500 bg-pink-50/50 text-pink-600 dark:bg-pink-900/20"
          : "border-slate-100 text-slate-500 dark:border-slate-800",
      )}
    >
      {children}
    </button>
  );
}
