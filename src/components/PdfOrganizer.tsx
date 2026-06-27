"use client";

import React, { useEffect, useRef, useState } from "react";
import { Layout, FileText, Download, RotateCw, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { pdfjsLib } from "@/lib/pdfjs";

type PageState = {
  id: string;
  originalIndex: number; // 0-based
  rotation: number; // 0, 90, 180, 270
  thumbnail: string;
};

export default function PdfOrganizer() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const pagesRef = useRef<PageState[]>([]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.thumbnail));
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setPages((prev) => {
        prev.forEach((page) => URL.revokeObjectURL(page.thumbnail));
        return [];
      });
      setIsProcessing(true);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        
        const loadedPages: PageState[] = [];
        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.3 });
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
            const thumbnailUrl = await new Promise<string | null>((resolve) => {
              canvas.toBlob((blob) => {
                resolve(blob ? URL.createObjectURL(blob) : null);
              }, "image/webp", 0.72);
            });

            if (!thumbnailUrl) {
              continue;
            }
            
            loadedPages.push({
              id: Math.random().toString(36).substr(2, 9),
              originalIndex: i - 1,
              rotation: 0,
              thumbnail: thumbnailUrl,
            });
          }
          setLoadingProgress(Math.round((i / totalPages) * 100));
        }
        setPages(loadedPages);
      } catch (err) {
        console.error("Load error:", err);
        alert("Failed to load PDF.");
      } finally {
        setIsProcessing(false);
        setLoadingProgress(0);
      }
    }
  };

  const rotatePage = (id: string) => {
    setPages(prev => prev.map(p => 
      p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    ));
  };

  const removePage = (id: string) => {
    if (pages.length <= 1) {
      alert("PDF must have at least one page.");
      return;
    }
    setPages(prev => {
      const removedPage = prev.find((page) => page.id === id);
      if (removedPage) {
        URL.revokeObjectURL(removedPage.thumbnail);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const movePage = (index: number, direction: "left" | "right") => {
    if (direction === "left" && index === 0) return;
    if (direction === "right" && index === pages.length - 1) return;

    const newPages = [...pages];
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    [newPages[index], newPages[targetIndex]] = [newPages[targetIndex], newPages[index]];
    setPages(newPages);
  };

  const handleSave = async () => {
    if (!file || pages.length === 0) return;
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const outDoc = await PDFDocument.create();
      
      for (const pageState of pages) {
        // Copy the specific page from source
        const [copiedPage] = await outDoc.copyPages(srcDoc, [pageState.originalIndex]);
        
        // Apply rotation
        // Note: pdf-lib adds to existing rotation, so we need to account for it if we want absolute
        // But for simplicity, we assume original is 0 or we use setRotation for absolute
        const currentRotation = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentRotation + pageState.rotation) % 360));
        
        outDoc.addPage(copiedPage);
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      a.download = `organized_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Organize Pages</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reorder, rotate, or remove pages from your PDF.</p>
          </div>
          {file && !isProcessing && (
             <button 
                onClick={() => {
                  setFile(null);
                  setPages((prev) => {
                    prev.forEach((page) => URL.revokeObjectURL(page.thumbnail));
                    return [];
                  });
                }}
                className="text-sm font-medium text-red-500 hover:text-red-600"
              >
                Start Over
              </button>
          )}
        </header>

        {!file ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 p-20 dark:border-slate-800 dark:bg-slate-900/30">
            <label className="flex cursor-pointer flex-col items-center">
              <div className="rounded-full bg-white p-6 shadow-xl dark:bg-slate-800 mb-6 transition-transform hover:scale-110">
                <Layout className="h-10 w-10 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Upload PDF to Organize</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center max-w-sm">
                Rearrange pages exactly how you want them.
              </p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-8 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-700 transition-all">
                Choose File
              </div>
            </label>
          </div>
        ) : isProcessing && loadingProgress < 100 && pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20">
             <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
             </div>
             <p className="text-slate-500 text-sm font-medium">Loading pages... {loadingProgress}%</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">
                  <FileText className="h-5 w-5 text-purple-500" />
                </div>
                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[300px]">
                  {file.name}
                </span>
                <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-500">
                  {pages.length} pages
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 py-4">
              {pages.map((page, index) => (
                <div 
                  key={page.id}
                  className="group relative flex flex-col gap-2"
                >
                  <div className="relative aspect-[3/4] rounded-xl border-2 border-transparent bg-white dark:bg-slate-900 shadow-md transition-all hover:shadow-xl overflow-hidden group-hover:ring-4 group-hover:ring-purple-500/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={page.thumbnail} 
                      alt={`Page ${index + 1}`} 
                      className="h-full w-full object-cover transition-transform duration-300"
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                    />
                    
                    {/* Hover Overlay Controls */}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                       <button 
                        onClick={() => rotatePage(page.id)}
                        className="p-2 bg-white rounded-full text-slate-800 hover:bg-purple-500 hover:text-white transition-colors"
                        title="Rotate 90°"
                       >
                         <RotateCw className="h-4 w-4" />
                       </button>
                       <button 
                        onClick={() => removePage(page.id)}
                        className="p-2 bg-white rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        title="Delete Page"
                       >
                         <Trash2 className="h-4 w-4" />
                       </button>
                    </div>

                    <div className="absolute bottom-2 left-2 rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold text-white">
                      {index + 1}
                    </div>
                  </div>
                  
                  {/* Reorder Buttons Below */}
                  <div className="flex items-center justify-between px-1">
                    <button 
                      onClick={() => movePage(index, "left")}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-purple-500 disabled:opacity-20 shadow-sm border border-slate-100 dark:border-slate-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Move</span>
                    <button 
                      onClick={() => movePage(index, "right")}
                      disabled={index === pages.length - 1}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-purple-500 disabled:opacity-20 shadow-sm border border-slate-100 dark:border-slate-700"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-6 flex justify-center py-4 pointer-events-none">
              <button
                onClick={handleSave}
                disabled={isProcessing}
                className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-purple-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-purple-600/30 transition-all hover:bg-purple-700 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              >
                {isProcessing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Save Changes
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
