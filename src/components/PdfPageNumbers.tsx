"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Hash, FileText, Download, AlertTriangle } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdfjs";
import { isSupportedText, parsePageRange } from "@/lib/watermark";
import {
  addPageNumbers,
  drawPageNumberOnCanvas,
  pageLabels,
  type NumberPosition,
  type PageNumberOptions,
} from "@/lib/pageNumbers";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import Slider from "@/components/Slider";
import { useI18n } from "@/i18n/client";
import { format, plural } from "@/i18n/config";

const PREVIEW_WIDTH = 600;
const POSITIONS: NumberPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Page as rendered for the preview, in its displayed orientation (PDF points). */
type PreviewBase = { canvas: HTMLCanvasElement; width: number; height: number };

export default function PdfPageNumbers() {
  const { t } = useI18n();
  const tt = t.pageNumbers;
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);

  const [template, setTemplate] = useState(tt.formats[0]);
  const [position, setPosition] = useState<NumberPosition>("bottom-center");
  const [startAt, setStartAt] = useState("1");
  const [pageRange, setPageRange] = useState("");
  const [size, setSize] = useState(12);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState("#000000");

  const [base, setBase] = useState<PreviewBase | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const count = pdf?.numPages ?? 0;
  const startNumber = Number(startAt);
  const startError = !Number.isInteger(startNumber) || startNumber < 0 ? tt.startError : "";

  const trimmed = template.trim();
  const templateError = !trimmed
    ? tt.enterFormat
    : !trimmed.includes("{n}")
      ? tt.missingPlaceholder
      : isSupportedText(trimmed)
        ? ""
        : t.watermark.latinOnly;

  const pages = useMemo(() => {
    if (!pageRange.trim() || !count) return null;
    return parsePageRange(pageRange, count);
  }, [pageRange, count]);
  const rangeError = pageRange.trim() && !pages ? format(t.watermark.rangeError, { max: count || "?" }) : "";
  const hasError = !!(templateError || rangeError || startError);

  const options: PageNumberOptions = useMemo(
    () => ({
      template: trimmed,
      position,
      startAt: startError ? 1 : startNumber,
      pages,
      size,
      margin,
      color,
    }),
    [trimmed, position, startNumber, startError, pages, size, margin, color],
  );

  const labels = useMemo(() => (count ? pageLabels(count, options) : new Map<number, string>()), [count, options]);
  // Preview the first page that actually gets a number.
  const previewPage = labels.size > 0 ? Math.min(...labels.keys()) : 1;

  useEffect(() => () => void pdf?.destroy(), [pdf]);

  // Render the preview page once per page change; settings only redraw the overlay.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(previewPage);
      const view = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PREVIEW_WIDTH / view.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (!cancelled) setBase({ canvas, width: view.width, height: view.height });
    })().catch((err) => console.error("Preview error:", err));
    return () => {
      cancelled = true;
    };
  }, [pdf, previewPage]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!base || !canvas) return;
    canvas.width = base.canvas.width;
    canvas.height = base.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base.canvas, 0, 0);
    const label = labels.get(previewPage);
    if (label && !templateError) {
      drawPageNumberOnCanvas(ctx, base.width, base.height, base.canvas.width / base.width, label, options);
    }
  }, [base, labels, previewPage, options, templateError]);

  const handleFile = async (selected: File | undefined) => {
    if (selected?.type !== "application/pdf") return;
    setError("");
    setResult(null);
    setBase(null);
    try {
      const data = await selected.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
      setPdf(doc);
      setBuffer(data);
      setFile(selected);
      setPageRange("");
    } catch (err) {
      console.error("Failed to open PDF:", err);
      setPdf(null);
      setFile(null);
      setError(
        err instanceof Error && err.name === "PasswordException" ? t.common.passwordProtected : tt.openError,
      );
    }
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  const create = async () => {
    if (!buffer || hasError) return;
    setIsWorking(true);
    setError("");
    try {
      const bytes = await addPageNumbers(buffer, options);
      setResult(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
    } catch (err) {
      console.error("Page number error:", err);
      setError(tt.failed);
    } finally {
      setIsWorking(false);
    }
  };

  const reset = () => {
    setPdf(null);
    setFile(null);
    setBuffer(null);
    setBase(null);
    setResult(null);
    setError("");
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#f0f4f8] p-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">{tt.title}</h1>
          <p className="mt-2 text-lg text-slate-500 dark:text-slate-400">{tt.subtitle}</p>
          <PrivacyNote />
        </header>

        {!file || !pdf ? (
          <div
            {...dropProps}
            className={cn(
              "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-20 shadow-sm dark:border-slate-800 dark:bg-slate-900",
              isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20",
            )}
          >
            <label className="group flex cursor-pointer flex-col items-center">
              <div className="mb-6 rounded-full bg-blue-50 p-8 shadow-inner transition-transform group-hover:scale-110 dark:bg-blue-900/20">
                <Hash className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">{t.common.dropPdf}</h3>
              <p className="mt-2 text-slate-500 dark:text-slate-400">{t.common.dropBrowse}</p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-8 rounded-2xl bg-blue-600 px-10 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 transition-all hover:bg-blue-700">
                {t.common.selectFile}
              </div>
            </label>
            {error && <p className="mt-6 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-slate-200 bg-slate-200/60 p-4 dark:border-slate-800 dark:bg-slate-900">
              <canvas ref={previewRef} className="h-auto max-w-full bg-white shadow-lg" />
              <p className="text-xs text-slate-500">{format(tt.previewOf, { n: previewPage })}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-6 w-6 flex-shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800 dark:text-slate-100" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatSize(file.size)} · {plural(count, t.common.pageCountOne, t.common.pageCountOther)}
                    </p>
                  </div>
                </div>
                <button onClick={reset} className="rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50">
                  {t.common.remove}
                </button>
              </div>

              {result ? (
                <div className="space-y-4 rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
                  <h3 className="text-xl font-bold text-emerald-600">{tt.done}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {format(t.watermark.resultSize, { size: formatSize(result.size) })}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setResult(null)}
                      className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      onClick={() => downloadBlob(result, `${tt.filePrefix}_${file.name.replace(/\.[^/.]+$/, "")}.pdf`)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700"
                    >
                      <Download className="h-5 w-5" />
                      {t.common.download}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{tt.position}</legend>
                    {/* A miniature page: top row and bottom row of slots */}
                    <div className="mx-auto flex aspect-[3/4] w-32 flex-col justify-between rounded-lg border-2 border-slate-200 p-1.5 dark:border-slate-700">
                      {[POSITIONS.slice(0, 3), POSITIONS.slice(3)].map((row) => (
                        <div key={row[0]} className="grid grid-cols-3 gap-1">
                          {row.map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setPosition(value)}
                              aria-pressed={position === value}
                              aria-label={tt.positions[value]}
                              title={tt.positions[value]}
                              className={cn(
                                "h-6 rounded-md text-[10px] font-bold",
                                position === value
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
                              )}
                            >
                              1
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <label htmlFor="pn-format" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                      {tt.format}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {tt.formats.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTemplate(preset)}
                          aria-pressed={trimmed === preset}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-bold",
                            trimmed === preset
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {format(preset, {
                            n: options.startAt,
                            total: options.startAt + Math.max(labels.size, 1) - 1,
                          })}
                        </button>
                      ))}
                    </div>
                    <input
                      id="pn-format"
                      type="text"
                      value={template}
                      maxLength={60}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 font-mono text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <p className="text-xs text-slate-500">{tt.formatHint}</p>
                    {templateError && <p className="text-xs text-red-500">{templateError}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="pn-start" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                        {tt.startAt}
                      </label>
                      <input
                        id="pn-start"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <label htmlFor="pn-color" className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {t.watermark.color}
                      </label>
                      <input
                        id="pn-color"
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  {startError && <p className="text-xs text-red-500">{startError}</p>}

                  <Slider label={t.watermark.size} value={size} min={8} max={36} unit="pt" onChange={setSize} />
                  <Slider label={tt.margin} value={margin} min={12} max={72} unit="pt" onChange={setMargin} />

                  {count > 1 && (
                    <div className="space-y-1">
                      <label htmlFor="pn-pages" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                        {t.watermark.pages} <span className="font-normal text-slate-400">{t.watermark.pagesHint}</span>
                      </label>
                      <input
                        id="pn-pages"
                        type="text"
                        placeholder={t.watermark.pagesPlaceholder}
                        value={pageRange}
                        onChange={(e) => setPageRange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setPageRange(`2-${count}`)}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {tt.skipCover}
                      </button>
                      {rangeError && <p className="text-xs text-red-500">{rangeError}</p>}
                    </div>
                  )}

                  {error && (
                    <p className="flex items-center gap-2 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" /> {error}
                    </p>
                  )}

                  <button
                    onClick={create}
                    disabled={isWorking || hasError}
                    className="w-full rounded-2xl bg-blue-600 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isWorking ? t.common.working : tt.addButton}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
