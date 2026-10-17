"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stamp, FileText, Download, Info, AlertTriangle } from "lucide-react";
import { pdfjsLib } from "@/lib/pdfjs";
import {
  applyWatermark,
  drawWatermarkOnCanvas,
  imageToPdf,
  isSupportedText,
  parsePageRange,
  type WatermarkOptions,
  type WatermarkPattern,
} from "@/lib/watermark";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import { useI18n } from "@/i18n/client";
import { format, plural } from "@/i18n/config";

const TEXT_PRESETS = ["COPY", "CONFIDENTIAL", "Hanya untuk keperluan "];
const PREVIEW_WIDTH = 600;

type PageInfo = { width: number; height: number; count: number };

export default function PdfWatermark() {
  const { t } = useI18n();
  const tt = t.watermark;
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);

  const [text, setText] = useState("COPY");
  const [pattern, setPattern] = useState<WatermarkPattern>("tile");
  const [size, setSize] = useState(36);
  const [opacity, setOpacity] = useState(30);
  const [color, setColor] = useState("#dc2626");
  const [angle, setAngle] = useState(45);
  const [pageRange, setPageRange] = useState("");
  const [flatten, setFlatten] = useState(false);
  const [isImage, setIsImage] = useState(false);

  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);

  const trimmedText = text.trim();
  const textError = !trimmedText
    ? tt.enterText
    : isSupportedText(trimmedText)
      ? ""
      : tt.latinOnly;

  const pages = useMemo(() => {
    if (!pageRange.trim() || !pageInfo) return null;
    return parsePageRange(pageRange, pageInfo.count);
  }, [pageRange, pageInfo]);
  const rangeError = pageRange.trim() && !pages ? format(tt.rangeError, { max: pageInfo?.count ?? "?" }) : "";

  const options: WatermarkOptions = useMemo(
    () => ({
      text: trimmedText,
      size,
      opacity: opacity / 100,
      color,
      angle,
      pattern,
      pages,
      flatten,
    }),
    [trimmedText, size, opacity, color, angle, pattern, pages, flatten],
  );

  const handleFile = async (selected: File | undefined) => {
    if (!selected) return;
    const image = selected.type.startsWith("image/");
    if (!image && selected.type !== "application/pdf") return;

    setError("");
    setResult(null);
    setPageInfo(null);
    setBuffer(null);
    try {
      const pdfBuffer = image ? await imageToPdf(selected) : await selected.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer.slice(0) }).promise;
      const first = await pdf.getPage(1);
      const base = first.getViewport({ scale: 1 });

      const scale = PREVIEW_WIDTH / base.width;
      const viewport = first.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available");
      await first.render({ canvasContext: ctx, viewport, canvas }).promise;

      baseRef.current = canvas;
      setPageInfo({ width: base.width, height: base.height, count: pdf.numPages });
      await pdf.destroy();
      setBuffer(pdfBuffer);
      setFile(selected);
      setIsImage(image);
      setFlatten(image);
      setPageRange("");
      setBaseVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to open file:", err);
      setFile(null);
      setError(tt.openError);
    }
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  // Preview: first page plus the watermark, drawn with the same geometry as the output.
  useEffect(() => {
    const base = baseRef.current;
    const canvas = previewRef.current;
    if (!base || !canvas || !pageInfo) return;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    if (!textError && (!pages || pages.has(1))) {
      drawWatermarkOnCanvas(ctx, pageInfo.width, pageInfo.height, base.width / pageInfo.width, options);
    }
  }, [baseVersion, pageInfo, options, pages, textError]);

  const createWatermark = async () => {
    if (!buffer || textError || rangeError) return;
    setIsWorking(true);
    setError("");
    try {
      const bytes = await applyWatermark(buffer, options);
      setResult(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
    } catch (err) {
      console.error("Watermark error:", err);
      setError(tt.failed);
    } finally {
      setIsWorking(false);
    }
  };

  const reset = () => {
    setFile(null);
    setBuffer(null);
    setPageInfo(null);
    setResult(null);
    setError("");
    baseRef.current = null;
  };

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">{tt.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
            {tt.subtitle}
          </p>
          <PrivacyNote />
        </header>

        {!file || !pageInfo ? (
          <div
            {...dropProps}
            className={cn(
              "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-20 shadow-sm dark:border-slate-800 dark:bg-slate-900",
              isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
            )}
          >
            <label className="flex cursor-pointer flex-col items-center group">
              <div className="rounded-full bg-blue-50 p-8 shadow-inner dark:bg-blue-900/20 mb-6 transition-transform group-hover:scale-110">
                <Stamp className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">{tt.dropTitle}</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">{tt.dropText}</p>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-8 rounded-2xl bg-blue-600 px-10 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all">
                {t.common.selectFile}
              </div>
            </label>
            {error && <p className="mt-6 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex justify-center rounded-3xl border border-slate-200 bg-slate-200/60 p-4 dark:border-slate-800 dark:bg-slate-900">
              <canvas ref={previewRef} className="h-auto max-w-full self-start bg-white shadow-lg" />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-6 w-6 flex-shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800 dark:text-slate-100" title={file.name}>{file.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(file.size)} · {plural(pageInfo.count, t.common.pageCountOne, t.common.pageCountOther)}</p>
                  </div>
                </div>
                <button onClick={reset} className="text-sm font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl">
                  {t.common.remove}
                </button>
              </div>

              {result ? (
                <div className="space-y-4 rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
                  <h3 className="text-xl font-bold text-emerald-600">{tt.done}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{format(tt.resultSize, { size: formatSize(result.size) })}</p>
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
                  <div className="space-y-2">
                    <label htmlFor="wm-text" className="block text-sm font-bold text-slate-700 dark:text-slate-200">{tt.text}</label>
                    <input
                      id="wm-text"
                      type="text"
                      value={text}
                      maxLength={120}
                      onChange={(e) => setText(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      {TEXT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setText(preset)}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {preset.trim()}{preset.endsWith(" ") ? "…" : ""}
                        </button>
                      ))}
                    </div>
                    {textError && <p className="text-xs text-red-500">{textError}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(["tile", "center"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPattern(value)}
                        className={`rounded-xl border-2 py-2 text-sm font-bold ${
                          pattern === value
                            ? "border-blue-500 bg-blue-50/50 text-blue-600 dark:bg-blue-900/20"
                            : "border-slate-100 text-slate-500 dark:border-slate-800"
                        }`}
                      >
                        {value === "tile" ? tt.repeat : tt.center}
                      </button>
                    ))}
                  </div>

                  <Slider label={tt.size} value={size} min={12} max={120} unit="pt" onChange={setSize} />
                  <Slider label={tt.opacity} value={opacity} min={5} max={100} unit="%" onChange={setOpacity} />
                  <Slider label={tt.rotation} value={angle} min={0} max={90} unit="°" onChange={setAngle} />

                  <div className="flex items-center justify-between">
                    <label htmlFor="wm-color" className="text-sm font-bold text-slate-700 dark:text-slate-200">{tt.color}</label>
                    <input id="wm-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200" />
                  </div>

                  {pageInfo.count > 1 && (
                    <div className="space-y-1">
                      <label htmlFor="wm-pages" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                        {tt.pages} <span className="font-normal text-slate-400">{tt.pagesHint}</span>
                      </label>
                      <input
                        id="wm-pages"
                        type="text"
                        placeholder={tt.pagesPlaceholder}
                        value={pageRange}
                        onChange={(e) => setPageRange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      {rangeError && <p className="text-xs text-red-500">{rangeError}</p>}
                    </div>
                  )}

                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="mt-1 h-4 w-4" />
                    <span className="text-sm">
                      <b className="text-slate-700 dark:text-slate-200">{tt.permanent}</b>
                      <span className="block text-xs text-slate-500">
                        {tt.permanentHint}
                      </span>
                    </span>
                  </label>

                  {!flatten && (
                    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
                      <Info className="h-4 w-4 flex-shrink-0 text-amber-600" />
                      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        {tt.removableWarning}
                        {isImage ? "" : tt.sensitiveHint}
                      </p>
                    </div>
                  )}

                  {error && (
                    <p className="flex items-center gap-2 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" /> {error}
                    </p>
                  )}

                  <button
                    onClick={createWatermark}
                    disabled={isWorking || !!textError || !!rangeError}
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

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
        <span className="font-medium text-slate-500">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
