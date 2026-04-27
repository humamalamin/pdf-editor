"use client";

import React, { useState } from "react";
import { Upload, FileText, X, Combine, Download, MoveUp, MoveDown } from "lucide-react";
import { PDFDocument } from "pdf-lib";

type MergeFile = {
  id: string;
  file: File;
  pageCount: number;
};

export default function PdfMerge() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const newFiles: MergeFile[] = [];
    for (const file of selectedFiles) {
      if (file.type === "application/pdf") {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          newFiles.push({
            id: Math.random().toString(36).substring(2, 9),
            file,
            pageCount: pdfDoc.getPageCount(),
          });
        } catch (err) {
          console.error("Error loading PDF:", err);
        }
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = ""; // Reset input
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const moveFile = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === files.length - 1) return;

    const newFiles = [...files];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
    setFiles(newFiles);
  };

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const mergeFile of files) {
        const arrayBuffer = await mergeFile.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = "merged_document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Merge error:", err);
      alert("Failed to merge PDFs. Please try again.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Merge PDFs</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Combine multiple PDF files into one in the order you want.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:-translate-y-0.5">
            <Upload className="h-4 w-4" />
            Add PDFs
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </header>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 p-20 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="rounded-full bg-white p-6 shadow-xl dark:bg-slate-800 mb-6">
              <Combine className="h-10 w-10 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No files selected</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-center max-w-sm">
              Upload the PDF files you want to merge. You can reorder them before combining.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {files.map((f, index) => (
                <div
                  key={f.id}
                  className="group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-900/30">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200" title={f.file.name}>
                      {f.file.name}
                    </p>
                    <p className="text-xs text-slate-500">{f.pageCount} pages</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveFile(index, "up")}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-blue-500 disabled:opacity-20"
                    >
                      <MoveUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveFile(index, "down")}
                      disabled={index === files.length - 1}
                      className="p-1 text-slate-400 hover:text-blue-500 disabled:opacity-20"
                    >
                      <MoveDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-500 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:bg-red-500 hover:text-white dark:bg-red-900/50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-10 flex justify-center pt-8 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={handleMerge}
                disabled={files.length < 2 || isMerging}
                className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              >
                {isMerging ? (
                  <>Combining...</>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Merge and Download
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
