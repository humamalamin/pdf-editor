"use client";

import React, { useState, useEffect, useRef } from "react";
import { Upload, Scissors, FileText, Download, CheckCircle2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export default function PdfSplit() {
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setSelectedPages([]);
      setThumbnails([]);
      
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalPages(pdf.numPages);
      
      // Generate thumbnails for first few pages (up to 20 for performance)
      const thumbs: string[] = [];
      const count = Math.min(pdf.numPages, 20);
      for (let i = 1; i <= count; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
          await page.render({ 
            canvasContext: context, 
            viewport: viewport,
            canvas: canvas 
          }).promise;
          thumbs.push(canvas.toDataURL());
        }
      }
      setThumbnails(thumbs);
    }
  };

  const togglePage = (pageIndex: number) => {
    setSelectedPages(prev => 
      prev.includes(pageIndex) 
        ? prev.filter(p => p !== pageIndex) 
        : [...prev, pageIndex].sort((a, b) => a - b)
    );
  };

  const handleSplit = async () => {
    if (!file || selectedPages.length === 0) return;
    setIsSplitting(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const splitPdf = await PDFDocument.create();
      
      // Page indices are 0-based in pdf-lib
      const copiedPages = await splitPdf.copyPages(
        pdfDoc, 
        selectedPages.map(p => p - 1)
      );
      
      copiedPages.forEach(page => splitPdf.addPage(page));

      const pdfBytes = await splitPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      a.download = `split_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Split error:", err);
      alert("Failed to split PDF. Please try again.");
    } finally {
      setIsSplitting(false);
    }
  };

  const selectAll = () => {
    const all = Array.from({ length: totalPages }, (_, i) => i + 1);
    setSelectedPages(all);
  };

  const clearSelection = () => {
    setSelectedPages([]);
  };

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Split PDF</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Extract specific pages from your PDF file into a new document.</p>
          </div>
          {file && (
            <button 
              onClick={() => {setFile(null); setTotalPages(0); setSelectedPages([]);}}
              className="text-sm font-medium text-red-500 hover:text-red-600"
            >
              Cancel / Start Over
            </button>
          )}
        </header>

        {!file ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 p-20 dark:border-slate-800 dark:bg-slate-900/30">
            <label className="flex cursor-pointer flex-col items-center">
              <div className="rounded-full bg-white p-6 shadow-xl dark:bg-slate-800 mb-6 group-hover:scale-110 transition-transform">
                <Scissors className="h-10 w-10 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Select a PDF to split</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center max-w-sm">
                Upload a file to see its pages and select which ones you want to extract.
              </p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-8 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all">
                Choose File
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
                  <FileText className="h-5 w-5 text-orange-500" />
                </div>
                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-500">
                  {totalPages} pages
                </span>
              </div>
              
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg">Select All</button>
                <button onClick={clearSelection} className="text-xs font-semibold text-slate-500 hover:bg-slate-50 px-3 py-1.5 rounded-lg">Clear</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div 
                  key={pageNum}
                  onClick={() => togglePage(pageNum)}
                  className={`group relative aspect-[3/4] cursor-pointer rounded-xl border-2 transition-all overflow-hidden ${
                    selectedPages.includes(pageNum) 
                      ? "border-orange-500 ring-4 ring-orange-500/10 shadow-lg" 
                      : "border-transparent bg-white dark:bg-slate-900 hover:border-slate-300 shadow-sm"
                  }`}
                >
                  {thumbnails[pageNum - 1] ? (
                    <img src={thumbnails[pageNum - 1]} alt={`Page ${pageNum}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-50 dark:bg-slate-800">
                      <span className="text-slate-300 font-bold text-2xl">{pageNum}</span>
                    </div>
                  )}
                  
                  <div className={`absolute inset-0 flex items-center justify-center bg-orange-500/20 transition-opacity ${selectedPages.includes(pageNum) ? 'opacity-100' : 'opacity-0'}`}>
                    <CheckCircle2 className="h-10 w-10 text-orange-500 drop-shadow-md" />
                  </div>
                  
                  <div className={`absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    selectedPages.includes(pageNum) ? 'bg-orange-500 text-white' : 'bg-slate-800/80 text-white'
                  }`}>
                    PAGE {pageNum}
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-6 flex justify-center py-4 bg-transparent pointer-events-none">
              <button
                onClick={handleSplit}
                disabled={selectedPages.length === 0 || isSplitting}
                className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-orange-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-orange-600/30 transition-all hover:bg-orange-700 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              >
                {isSplitting ? (
                  <>Extracting...</>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Extract {selectedPages.length} {selectedPages.length === 1 ? 'Page' : 'Pages'}
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
