"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImageUp, PenLine, Type, Undo2, X } from "lucide-react";
import "@fontsource/dancing-script/400.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/sacramento/400.css";
import "@fontsource/caveat/400.css";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import { useI18n } from "@/i18n/client";
import {
  SIGNATURE_COLORS,
  SIGNATURE_FONTS,
  imageToCanvas,
  loadImage,
  loadSavedSignatures,
  removeSavedSignature,
  renderTypedSignature,
  saveSignature,
  trimCanvas,
} from "@/lib/signature";

type Tab = "draw" | "type" | "upload";
type Point = { x: number; y: number };
type Stroke = Point[];

const PAD_HEIGHT = 200;
const PEN_WIDTH = 2.5;
const EXPORT_SCALE = 3; // drawn signatures are rasterised at 3x so they stay crisp when enlarged

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = PEN_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Quadratic curves through segment midpoints smooth out the jagged pointer samples
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length - 1; i++) {
      const mid = { x: (stroke[i].x + stroke[i + 1].x) / 2, y: (stroke[i].y + stroke[i + 1].y) / 2 };
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
    }
    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

function DrawPad({
  strokes,
  setStrokes,
  color,
}: {
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  color: string;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !width) return;
    const dpr = window.devicePixelRatio;
    canvas.width = width * dpr;
    canvas.height = PAD_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    drawStrokes(ctx, activeStroke.current ? [...strokes, activeStroke.current] : strokes, color);
  }, [strokes, color, width]);

  useEffect(redraw, [redraw]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none rounded-xl border border-slate-200 bg-white dark:border-slate-700"
        style={{ height: PAD_HEIGHT }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          activeStroke.current = [pointFrom(e)];
          redraw();
        }}
        onPointerMove={(e) => {
          if (!activeStroke.current) return;
          activeStroke.current.push(pointFrom(e));
          redraw();
        }}
        onPointerUp={() => {
          const stroke = activeStroke.current;
          activeStroke.current = null;
          if (stroke) setStrokes((prev) => [...prev, stroke]);
        }}
        onPointerCancel={() => {
          activeStroke.current = null;
          redraw();
        }}
      />
      {/* Signature line guide */}
      <div className="pointer-events-none absolute inset-x-8 bottom-12 border-b border-dashed border-slate-300" />
      {strokes.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          {t.signature.drawHere}
        </p>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {SIGNATURE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={cn("h-6 w-6 rounded-full", value === c && "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900")}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export default function SignatureDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}) {
  const { t } = useI18n();
  const ts = t.signature;
  const [tab, setTab] = useState<Tab>("draw");
  const [color, setColor] = useState<string>(SIGNATURE_COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [typedName, setTypedName] = useState("");
  const [fontFamily, setFontFamily] = useState<string>(SIGNATURE_FONTS[0].family);
  const [uploadSrc, setUploadSrc] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [saveForLater, setSaveForLater] = useState(true);
  const [saved, setSaved] = useState<string[]>(loadSavedSignatures);
  const [isWorking, setIsWorking] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (tab === "type") nameInputRef.current?.focus();
  }, [tab]);

  // Preview exactly what will be inserted, background removal included
  useEffect(() => {
    if (!uploadSrc) return;
    let cancelled = false;
    loadImage(uploadSrc).then((img) => {
      if (!cancelled) setUploadPreview(imageToCanvas(img, removeBackground).toDataURL("image/png"));
    });
    return () => {
      cancelled = true;
    };
  }, [uploadSrc, removeBackground]);

  const handleUploadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setUploadSrc(reader.result as string);
    reader.readAsDataURL(file);
  };
  const { isDragging, dropProps } = useFileDrop((files) => handleUploadFile(files[0]));

  const canInsert =
    (tab === "draw" && strokes.length > 0) ||
    (tab === "type" && typedName.trim().length > 0) ||
    (tab === "upload" && uploadPreview !== null);

  const buildSignature = async (): Promise<string | null> => {
    let canvas: HTMLCanvasElement | null = null;
    if (tab === "draw") {
      const width = padRef.current?.clientWidth ?? 500;
      canvas = document.createElement("canvas");
      canvas.width = width * EXPORT_SCALE;
      canvas.height = PAD_HEIGHT * EXPORT_SCALE;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
      drawStrokes(ctx, strokes, color);
    } else if (tab === "type") {
      canvas = await renderTypedSignature(typedName.trim(), fontFamily, color);
    } else if (tab === "upload" && uploadPreview) {
      canvas = imageToCanvas(await loadImage(uploadPreview), false);
    }
    return canvas ? (trimCanvas(canvas)?.toDataURL("image/png") ?? null) : null;
  };

  const handleInsert = async () => {
    setIsWorking(true);
    try {
      const dataUrl = await buildSignature();
      if (!dataUrl) return;
      if (saveForLater) saveSignature(dataUrl);
      onInsert(dataUrl);
    } finally {
      setIsWorking(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "draw", label: ts.draw, icon: <PenLine className="h-4 w-4" /> },
    { id: "type", label: ts.type, icon: <Type className="h-4 w-4" /> },
    { id: "upload", label: ts.upload, icon: <ImageUp className="h-4 w-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 id="signature-dialog-title" className="text-lg font-semibold text-slate-800 dark:text-white">
            {ts.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title={ts.close}
            aria-label={ts.close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {saved.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ts.savedHeading}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {saved.map((sig) => (
                  <div key={sig} className="group relative">
                    <button
                      type="button"
                      onClick={() => onInsert(sig)}
                      title={ts.insertSaved}
                      className="flex h-16 w-full items-center justify-center rounded-lg border border-slate-200 bg-white p-2 hover:border-blue-400 hover:ring-2 hover:ring-blue-500/20 dark:border-slate-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sig} alt={ts.savedAlt} className="max-h-full max-w-full object-contain" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaved(removeSavedSignature(sig))}
                      title={ts.removeSaved}
                      aria-label={ts.removeSaved}
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-slate-200 bg-white p-0.5 text-slate-500 shadow-sm hover:text-red-500 dark:border-slate-600 dark:bg-slate-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
                  tab === item.id
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {tab === "draw" && (
            <div className="space-y-3">
              <div ref={padRef}>
                <DrawPad strokes={strokes} setStrokes={setStrokes} color={color} />
              </div>
              <div className="flex items-center justify-between">
                <ColorPicker value={color} onChange={setColor} />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                    disabled={strokes.length === 0}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Undo2 className="h-4 w-4" /> {ts.undo}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrokes([])}
                    disabled={strokes.length === 0}
                    className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {ts.clear}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "type" && (
            <div className="space-y-3">
              <input
                ref={nameInputRef}
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canInsert) handleInsert();
                }}
                placeholder={ts.typePlaceholder}
                maxLength={60}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                {SIGNATURE_FONTS.map((f) => (
                  <button
                    key={f.family}
                    type="button"
                    onClick={() => setFontFamily(f.family)}
                    title={f.label}
                    className={cn(
                      "flex h-20 items-center justify-center overflow-hidden rounded-xl border bg-white px-3 dark:bg-white",
                      fontFamily === f.family
                        ? "border-blue-500 ring-2 ring-blue-500/30"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                    )}
                  >
                    <span
                      className="truncate text-3xl"
                      style={{ fontFamily: `"${f.family}"`, color }}
                    >
                      {typedName.trim() || ts.namePreview}
                    </span>
                  </button>
                ))}
              </div>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          )}

          {tab === "upload" && (
            <div className="space-y-3">
              <label
                {...dropProps}
                className={cn(
                  "flex h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-3 text-center transition-colors hover:border-slate-400 dark:border-slate-700",
                  isDragging && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                )}
                // Checkerboard shows which parts of the image became transparent
                style={
                  uploadPreview
                    ? {
                        backgroundImage:
                          "repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%)",
                        backgroundSize: "16px 16px",
                      }
                    : undefined
                }
              >
                {uploadPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadPreview} alt={ts.previewAlt} className="max-h-full max-w-full object-contain" />
                ) : (
                  <>
                    <ImageUp className="mb-2 h-8 w-8 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {ts.uploadPrompt}
                    </span>
                    <span className="mt-1 text-xs text-slate-400">{ts.uploadFormats}</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={removeBackground}
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                {ts.removeBackground}
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={saveForLater}
              onChange={(e) => setSaveForLater(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            {ts.saveOnDevice}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!canInsert || isWorking}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
            >
              {ts.insert}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
