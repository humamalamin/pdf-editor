"use client";

import React, { useRef, useState } from "react";
import {
  Minimize2,
  FileText,
  Download,
  Zap,
  ShieldCheck,
  Info,
  Target,
  AlertTriangle,
} from "lucide-react";
import {
  compressByLevel,
  compressToTarget,
  CompressCancelledError,
  getPageCount,
  LARGE_PDF_PAGES,
  type CompressionLevel,
} from "@/lib/compress";
import { downloadBlob, formatSize } from "@/lib/utils";

type Mode = CompressionLevel | "target";
type Unit = "KB" | "MB";

const OPTIONS: {
  mode: Mode;
  label: string;
  hint: string;
  Icon: typeof Zap;
}[] = [
  { mode: "low", label: "Basic", hint: "High quality, small compression", Icon: ShieldCheck },
  { mode: "medium", label: "Balanced", hint: "Good quality, good compression", Icon: Zap },
  { mode: "high", label: "Extreme", hint: "Lower quality, max compression", Icon: Minimize2 },
  { mode: "target", label: "Target size", hint: "Compress to a size you choose", Icon: Target },
];

const PRESETS: { value: number; unit: Unit }[] = [
  { value: 200, unit: "KB" },
  { value: 500, unit: "KB" },
  { value: 1, unit: "MB" },
  { value: 2, unit: "MB" },
];

const toBytes = (value: number, unit: Unit) =>
  Math.round(value * (unit === "MB" ? 1024 * 1024 : 1024));

export default function PdfCompress() {
  const [file, setFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("medium");
  const [targetValue, setTargetValue] = useState("500");
  const [targetUnit, setTargetUnit] = useState<Unit>("KB");
  const [result, setResult] = useState<{
    blob: Blob;
    reachedTarget: boolean;
    targetBytes: number | null;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const originalSize = file?.size ?? 0;
  const targetBytes =
    mode === "target" ? toBytes(Number(targetValue), targetUnit) : null;
  const targetInvalid = mode === "target" && !(Number(targetValue) > 0);
  const targetAlreadyMet =
    targetBytes !== null && !targetInvalid && targetBytes >= originalSize;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setResult(null);
      setPageCount(null);
      selectedFile
        .arrayBuffer()
        .then(getPageCount)
        .then(setPageCount)
        .catch(() => setPageCount(null));
    }
  };

  const download = (blob: Blob) => {
    if (!file) return;
    downloadBlob(blob, `compressed_${file.name.replace(/\.[^/.]+$/, "")}.pdf`);
  };

  const compressPdf = async () => {
    if (!file || targetInvalid || targetAlreadyMet) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsCompressing(true);
    setProgress("Starting...");

    try {
      const buffer = await file.arrayBuffer();
      const options = { signal: controller.signal, onProgress: setProgress };
      const { bytes, reachedTarget } =
        targetBytes !== null
          ? await compressToTarget(buffer, targetBytes, options)
          : await compressByLevel(buffer, mode as CompressionLevel, options);

      setResult({
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        reachedTarget,
        targetBytes,
      });
    } catch (err) {
      if (!(err instanceof CompressCancelledError)) {
        console.error("Compression error:", err);
        alert("Failed to compress PDF.");
      }
    } finally {
      abortRef.current = null;
      setIsCompressing(false);
    }
  };

  const compressedSize = result?.blob.size ?? null;
  const savings = compressedSize
    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Compress PDF</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Reduce file size while keeping the best possible quality.</p>
        </header>

        {!file ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-20 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label className="flex cursor-pointer flex-col items-center group">
              <div className="rounded-full bg-blue-50 p-8 shadow-inner dark:bg-blue-900/20 mb-6 transition-transform group-hover:scale-110">
                <Minimize2 className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">Drop PDF here</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">or click to browse from your device</p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-8 rounded-2xl bg-blue-600 px-10 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all">
                Select File
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            {/* File Info Card */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-2xl">
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[300px]" title={file.name}>
                    {file.name}
                  </h4>
                  <p className="text-sm font-medium text-slate-500">{formatSize(originalSize)}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setFile(null);
                  setResult(null);
                  setPageCount(null);
                }}
                className="text-sm font-bold text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
              >
                Remove
              </button>
            </div>

            {!result && (
              <>
                {/* Compression Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {OPTIONS.map(({ mode: optionMode, label, hint, Icon }) => (
                    <button
                      key={optionMode}
                      onClick={() => setMode(optionMode)}
                      disabled={isCompressing}
                      className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all relative ${
                        mode === optionMode
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20"
                          : "border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-slate-200"
                      }`}
                    >
                      {optionMode === "medium" && mode === "medium" && (
                        <span className="absolute -top-3 px-3 py-1 bg-blue-500 text-[10px] font-bold text-white rounded-full uppercase tracking-widest">Recommended</span>
                      )}
                      <div className={`p-2 rounded-lg ${mode === optionMode ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500 mt-1">{hint}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {pageCount !== null && pageCount > LARGE_PDF_PAGES && mode !== "low" && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4 rounded-2xl flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      <b>Large document ({pageCount} pages):</b> this mode renders every page, so it can be slow and use a lot of memory
                      {mode === "target" ? ", and Target size repeats the work for each quality it tries" : ""}. Basic mode is much faster. Close other tabs if the browser becomes unresponsive.
                    </p>
                  </div>
                )}

                {mode === "target" && (
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-200" htmlFor="target-size">
                      Maximum file size
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="target-size"
                        type="number"
                        min="1"
                        inputMode="decimal"
                        value={targetValue}
                        disabled={isCompressing}
                        onChange={(e) => setTargetValue(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-lg font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <select
                        aria-label="Unit"
                        value={targetUnit}
                        disabled={isCompressing}
                        onChange={(e) => setTargetUnit(e.target.value as Unit)}
                        className="rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="KB">KB</option>
                        <option value="MB">MB</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PRESETS.map((preset) => (
                        <button
                          key={`${preset.value}${preset.unit}`}
                          type="button"
                          disabled={isCompressing}
                          onClick={() => {
                            setTargetValue(String(preset.value));
                            setTargetUnit(preset.unit);
                          }}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {preset.value} {preset.unit}
                        </button>
                      ))}
                    </div>
                    {targetInvalid && (
                      <p className="text-xs text-red-500">Enter a size greater than 0.</p>
                    )}
                    {targetAlreadyMet && (
                      <p className="text-xs text-emerald-600">
                        Your file ({formatSize(originalSize)}) is already within this target.
                      </p>
                    )}
                  </div>
                )}

                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4 rounded-2xl flex gap-3">
                  <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    <b>Note:</b> Balanced, Extreme, and Target size modes may convert text to images to achieve significant size reduction. Target size tries lossless optimization first. For text-only PDFs with no images, use Basic mode.
                  </p>
                </div>
              </>
            )}

            <div className="flex flex-col items-center pt-6">
              {!result ? (
                <div className="flex w-full max-w-sm flex-col gap-3">
                  <button
                    onClick={compressPdf}
                    disabled={isCompressing || targetInvalid || targetAlreadyMet}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-xl font-bold text-white shadow-2xl shadow-blue-600/30 transition-all hover:bg-blue-700 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
                  >
                    {isCompressing ? "Compressing..." : "Compress PDF"}
                  </button>
                  {isCompressing && (
                    <>
                      <p className="text-center text-sm text-slate-500" role="status">{progress}</p>
                      <button
                        onClick={() => abortRef.current?.abort()}
                        className="rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-full space-y-6">
                  {result.reachedTarget ? (
                    <div className="flex flex-col items-center p-8 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-3xl text-center">
                      <h3 className="text-2xl font-bold text-emerald-600 mb-2">Success!</h3>
                      <p className="text-slate-600 dark:text-slate-300 text-lg">
                        {savings > 0 ? (
                          <>Your PDF is now <span className="font-bold text-emerald-600">{savings}%</span> smaller!</>
                        ) : (
                          <>This PDF could not be made smaller with this setting.</>
                        )}
                      </p>
                      <Sizes before={originalSize} after={compressedSize ?? 0} target={result.targetBytes} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center p-8 bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-300 dark:border-amber-800 rounded-3xl text-center">
                      <AlertTriangle className="h-8 w-8 text-amber-600 mb-2" />
                      <h3 className="text-2xl font-bold text-amber-600 mb-2">Target not reached</h3>
                      <p className="text-slate-600 dark:text-slate-300">
                        The smallest result we could produce is {formatSize(compressedSize ?? 0)}. Try a larger target.
                      </p>
                      <Sizes before={originalSize} after={compressedSize ?? 0} target={result.targetBytes} />
                    </div>
                  )}

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setResult(null)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 text-lg font-bold text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => download(result.blob)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-xl shadow-blue-600/20 transition-all hover:bg-blue-700 hover:-translate-y-1"
                    >
                      <Download className="h-5 w-5" />
                      Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Sizes({
  before,
  after,
  target,
}: Readonly<{ before: number; after: number; target: number | null }>) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm">
      <div className="text-slate-400">Before: <span className="text-slate-600 dark:text-slate-200 font-bold">{formatSize(before)}</span></div>
      <div className="text-slate-400">After: <span className="text-emerald-600 font-bold">{formatSize(after)}</span></div>
      {target !== null && (
        <div className="text-slate-400">Target: <span className="text-slate-600 dark:text-slate-200 font-bold">{formatSize(target)}</span></div>
      )}
    </div>
  );
}
