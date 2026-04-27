"use client";

import React, { useState } from "react";
import { Upload, Minimize2, FileText, Download, Zap, ShieldCheck, Info } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

type CompressionLevel = "low" | "medium" | "high";

export default function PdfCompress() {
  const [file, setFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("medium");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setOriginalSize(selectedFile.size);
      setCompressedSize(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const compressPdf = async () => {
    if (!file) return;
    setIsCompressing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      let compressedBytes: Uint8Array;

      if (level === "low") {
        // Just optimize the structure
        compressedBytes = await pdfDoc.save({ 
          useObjectStreams: true,
          addDefaultPage: false 
        });
      } else {
        // Lossy compression: Re-render pages at lower DPI
        // Medium = 150 DPI, High = 72 DPI
        const scale = level === "medium" ? 1.5 : 0.75;
        const quality = level === "medium" ? 0.7 : 0.4;
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const newPdfDoc = await PDFDocument.create();
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: scale * 1.5 }); // Base scale adjustment
          
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          if (context) {
            await page.render({ 
              canvasContext: context, 
              viewport,
              canvas: canvas 
            }).promise;
            
            // Convert page to JPEG with specified quality
            const imgData = canvas.toDataURL("image/jpeg", quality);
            const img = await newPdfDoc.embedJpg(imgData);
            
            const newPage = newPdfDoc.addPage([img.width, img.height]);
            newPage.drawImage(img, {
              x: 0,
              y: 0,
              width: img.width,
              height: img.height,
            });
          }
        }
        compressedBytes = await newPdfDoc.save({ useObjectStreams: true });
      }

      setCompressedSize(compressedBytes.length);
      
      const blob = new Blob([compressedBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      a.download = `compressed_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Compression error:", err);
      alert("Failed to compress PDF.");
    } finally {
      setIsCompressing(false);
    }
  };

  const savings = compressedSize ? Math.round(((originalSize - compressedSize) / originalSize) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Compress PDF</h1>
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
                onClick={() => setFile(null)}
                className="text-sm font-bold text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
              >
                Remove
              </button>
            </div>

            {/* Compression Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setLevel("low")}
                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${
                  level === "low" 
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" 
                    : "border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-slate-200"
                }`}
              >
                <div className={`p-2 rounded-lg ${level === "low" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 dark:text-slate-200">Basic</p>
                  <p className="text-xs text-slate-500 mt-1">High quality, small compression</p>
                </div>
              </button>

              <button
                onClick={() => setLevel("medium")}
                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all relative ${
                  level === "medium" 
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" 
                    : "border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-slate-200"
                }`}
              >
                {level === "medium" && (
                  <span className="absolute -top-3 px-3 py-1 bg-blue-500 text-[10px] font-bold text-white rounded-full uppercase tracking-widest">Recommended</span>
                )}
                <div className={`p-2 rounded-lg ${level === "medium" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                  <Zap className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 dark:text-slate-200">Balanced</p>
                  <p className="text-xs text-slate-500 mt-1">Good quality, good compression</p>
                </div>
              </button>

              <button
                onClick={() => setLevel("high")}
                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${
                  level === "high" 
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" 
                    : "border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-slate-200"
                }`}
              >
                <div className={`p-2 rounded-lg ${level === "high" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                  <Minimize2 className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 dark:text-slate-200">Extreme</p>
                  <p className="text-xs text-slate-500 mt-1">Lower quality, max compression</p>
                </div>
              </button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4 rounded-2xl flex gap-3">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <b>Note:</b> Balanced and Extreme modes will convert text to images to achieve significant size reduction. For text-only PDFs with no images, use Basic mode.
              </p>
            </div>

            <div className="flex flex-col items-center pt-6">
              {!compressedSize ? (
                <button
                  onClick={compressPdf}
                  disabled={isCompressing}
                  className="w-full max-w-sm flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-xl font-bold text-white shadow-2xl shadow-blue-600/30 transition-all hover:bg-blue-700 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
                >
                  {isCompressing ? "Compressing..." : "Compress PDF"}
                </button>
              ) : (
                <div className="w-full space-y-6">
                  <div className="flex flex-col items-center p-8 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-3xl text-center">
                    <h3 className="text-2xl font-bold text-emerald-600 mb-2">Success!</h3>
                    <p className="text-slate-600 dark:text-slate-300 text-lg">
                      Your PDF is now <span className="font-bold text-emerald-600">{savings}%</span> smaller!
                    </p>
                    <div className="mt-4 flex gap-8 text-sm">
                      <div className="text-slate-400">Before: <span className="text-slate-600 dark:text-slate-200 font-bold">{formatSize(originalSize)}</span></div>
                      <div className="text-slate-400">After: <span className="text-emerald-600 font-bold">{formatSize(compressedSize)}</span></div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center gap-4">
                     <button
                        onClick={compressPdf}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 text-lg font-bold text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={compressPdf}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-xl shadow-blue-600/20 transition-all hover:bg-blue-700 hover:-translate-y-1"
                      >
                        <Download className="h-5 w-5" />
                        Download Again
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
