"use client";

import React, { useEffect, useRef, useState } from "react";
import { Images, ImagePlus, Download, X, ArrowLeft, ArrowRight, RotateCw, AlertTriangle } from "lucide-react";
import {
  imagesToPdf,
  type MarginOption,
  type OrientationOption,
  type PageSizeOption,
} from "@/lib/convert";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";
import { useI18n } from "@/i18n/client";
import { format, plural } from "@/i18n/config";

type Item = { id: string; file: File; url: string; rotation: number };

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp";

export default function ImageToPdf() {
  const { t } = useI18n();
  const tt = t.imageToPdf;
  const pageSizes: { value: PageSizeOption; label: string }[] = [
    { value: "fit", label: tt.sameAsImage },
    { value: "a4", label: "A4" },
    { value: "letter", label: "Letter" },
  ];
  const orientations: { value: OrientationOption; label: string }[] = [
    { value: "auto", label: tt.auto },
    { value: "portrait", label: tt.portrait },
    { value: "landscape", label: tt.landscape },
  ];
  const margins: { value: MarginOption; label: string }[] = [
    { value: "none", label: tt.none },
    { value: "small", label: tt.small },
    { value: "large", label: tt.large },
  ];
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeOption>("a4");
  const [orientation, setOrientation] = useState<OrientationOption>("auto");
  const [margin, setMargin] = useState<MarginOption>("small");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  // Revoke preview URLs on unmount; removals revoke their own URL.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const addFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    setError(images.length < files.length ? tt.skipped : "");
    if (images.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: Math.random().toString(36).slice(2, 9),
        file,
        url: URL.createObjectURL(file),
        rotation: 0,
      })),
    ]);
  };

  const { isDragging, dropProps } = useFileDrop(addFiles);

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const rotateItem = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i)));
  };

  const clearAll = () => {
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setError("");
  };

  const convert = async () => {
    if (items.length === 0) return;
    setError("");
    setProgress({ done: 0, total: items.length });
    try {
      const bytes = await imagesToPdf(items, {
        pageSize,
        orientation,
        margin,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const name = items.length === 1 ? items[0].file.name.replace(/\.[^/.]+$/, "") : tt.fileName;
      downloadBlob(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
    } catch (err) {
      console.error("Image to PDF error:", err);
      setError(tt.failed);
    } finally {
      setProgress(null);
    }
  };

  const fileInput = (
    <input
      type="file"
      accept={ACCEPT}
      multiple
      className="hidden"
      onChange={(e) => {
        addFiles(Array.from(e.target.files || []));
        e.target.value = "";
      }}
    />
  );

  return (
    <div
      {...dropProps}
      className={cn(
        "flex h-full flex-col overflow-auto bg-[#f0f4f8] p-6 transition-shadow dark:bg-slate-950",
        isDragging && items.length > 0 && "ring-4 ring-inset ring-blue-400",
      )}
    >
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{tt.title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {tt.subtitle}
            </p>
            <PrivacyNote />
          </div>
          {items.length > 0 && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700">
              <ImagePlus className="h-4 w-4" />
              {tt.addImages}
              {fileInput}
            </label>
          )}
        </header>

        {items.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 p-20 dark:border-slate-800 dark:bg-slate-900/30",
              isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20",
            )}
          >
            <label className="group flex cursor-pointer flex-col items-center">
              <div className="mb-6 rounded-full bg-white p-6 shadow-xl transition-transform group-hover:scale-110 dark:bg-slate-800">
                <Images className="h-10 w-10 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{tt.emptyTitle}</h3>
              <p className="mt-2 max-w-sm text-center text-slate-500 dark:text-slate-400">
                {tt.emptyText}
              </p>
              {fileInput}
              <div className="mt-8 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700">
                {tt.chooseImages}
              </div>
            </label>
            {error && <p className="mt-6 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
              <OptionGroup label={tt.pageSize} options={pageSizes} value={pageSize} onChange={setPageSize} />
              <OptionGroup
                label={tt.orientation}
                options={orientations}
                value={orientation}
                onChange={setOrientation}
                disabled={pageSize === "fit"}
              />
              <OptionGroup label={tt.margin} options={margins} value={margin} onChange={setMargin} />
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>
                {plural(items.length, tt.imageCountOne, tt.imageCountOther)} · {formatSize(items.reduce((s, i) => s + i.file.size, 0))}
              </span>
              <button onClick={clearAll} className="font-medium text-red-500 hover:text-red-600">
                {t.common.removeAll}
              </button>
            </div>

            <ol className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-100 p-2 dark:bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.file.name}
                      className="max-h-full max-w-full object-contain transition-transform"
                      style={{
                        transform: `rotate(${item.rotation}deg)${item.rotation % 180 ? " scale(0.75)" : ""}`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5 dark:border-slate-800">
                    <span className="mr-auto rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <IconButton label={t.common.moveLeft} onClick={() => moveItem(index, -1)} disabled={index === 0}>
                      <ArrowLeft className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={t.common.moveRight} onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                      <ArrowRight className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={t.common.rotate} onClick={() => rotateItem(item.id)}>
                      <RotateCw className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label={format(tt.removeImage, { name: item.file.name })}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-500 shadow-sm transition-all hover:bg-red-500 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 dark:bg-red-900/50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ol>

            {error && (
              <p className="flex items-center justify-center gap-2 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}

            <div className="pointer-events-none sticky bottom-6 flex justify-center py-4">
              <button
                onClick={convert}
                disabled={!!progress}
                className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-blue-600/30 transition-all hover:-translate-y-1 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none"
              >
                {progress ? (
                  <>{format(tt.adding, { done: Math.min(progress.done + 1, progress.total), total: progress.total })}</>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    {tt.convert}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}>) {
  return (
    <fieldset disabled={disabled} className={cn(disabled && "opacity-40")}>
      <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "rounded-xl border-2 px-1 py-2 text-xs font-bold sm:text-sm",
              value === option.value
                ? "border-blue-500 bg-blue-50/50 text-blue-600 dark:bg-blue-900/20"
                : "border-slate-100 text-slate-500 dark:border-slate-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: Readonly<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-20 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
