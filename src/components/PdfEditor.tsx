"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Type, Save, Trash2, ChevronLeft, ChevronRight, Image as ImageIcon, PenTool } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb } from "pdf-lib";
import { Rnd } from "react-rnd";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

type Annotation = {
  id: string;
  type: "text" | "image";
  page: number;
  x: number;
  y: number;
  content: string; // text string or data URL for image
  width?: number;
  height?: number;
  fontSize?: number;
};

export default function PdfEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF when file changes
  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      return;
    }

    const loadPdf = async () => {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setScale(1.5); // Default scale
    };

    loadPdf().catch(console.error);
  }, [pdfFile]);

  const renderTaskRef = useRef<any>(null);

  // Render Page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        // ignore cancellation errors
      }
    }

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale });
    
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Bersihkan canvas agar halaman sebelumnya tidak berbayang
    context.clearRect(0, 0, canvas.width, canvas.height);

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext: any = {
      canvasContext: context,
      viewport: viewport,
    };

    renderTaskRef.current = page.render(renderContext);

    try {
      await renderTaskRef.current.promise;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") {
        console.log("Render error", e);
      }
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setAnnotations([]);
    }
  };

  const handleClear = () => {
    setPdfFile(null);
    setPdfDoc(null);
    setAnnotations([]);
  };

  const addText = () => {
    const newText: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      type: "text",
      page: currentPage,
      x: 50,
      y: 50,
      content: "",
      fontSize: 16,
    };
    setAnnotations([...annotations, newText]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Set standard height, dynamic width based on aspect ratio
        const defaultHeight = 50;
        const aspect = img.width / img.height;
        const newImage: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          type: "image",
          page: currentPage,
          x: 50,
          y: 50,
          content: dataUrl,
          width: defaultHeight * aspect,
          height: defaultHeight,
        };
        setAnnotations((prev) => [...prev, newImage]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann))
    );
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.map(ann => ann.id === id ? { ...ann, deleted: true } : ann).filter(a => !('deleted' in a)));
  };

  const downloadPdf = async () => {
    if (!pdfFile || annotations.length === 0) return;
    setIsExporting(true);

    try {
      const existingPdfBytes = await pdfFile.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(existingPdfBytes);

      // PDF-lib registers standard fonts
      const helveticaFont = await pdfDocLib.embedFont(pdfDocLib.getForm() ? 
        (await import("pdf-lib")).StandardFonts.Helvetica : 
        (await import("pdf-lib")).StandardFonts.Helvetica
      ); 
      // Import dynamic fix
      const { StandardFonts } = await import("pdf-lib");
      const font = await pdfDocLib.embedFont(StandardFonts.Helvetica);

      for (const ann of annotations) {
        const pages = pdfDocLib.getPages();
        const pdfPage = pages[ann.page - 1];
        const { width, height } = pdfPage.getSize();

        // Canvas element is scaled, so we must calculate relative positions
        const canvas = canvasRef.current;
        if (!canvas) continue;

        // X, Y are in un-scaled CSS pixels from Rnd. 
        // Need to translate it to native PDF points.
        // The canvas has CSS width/height = viewport.width/height.
        const viewportPageTask = await pdfDoc?.getPage(ann.page);
        const unscaledViewport = viewportPageTask?.getViewport({ scale: 1 });
        
        if (!unscaledViewport) continue;

        // X, Y are currently based on the React-RND container (which is dimensioned same as scaled canvas)
        // Ratio mapping: CSS pixel -> Unscaled PDF Point
        const xPos = (ann.x / scale);
        const yPos = (ann.y / scale);

        // pdf-lib's origin is bottom-left, CSS is top-left
        if (ann.type === "text") {
          const fontSize = ann.fontSize || 16;
          // Font size is in unscaled pixels relative to standard document scale
          // PDF natively renders \n but calculating exact line breaks is easier explicitly to match html's scale
          const lines = ann.content.split('\n');
          let currentY = height - yPos - fontSize; 
          for (const line of lines) {
             pdfPage.drawText(line, {
               x: xPos,
               y: currentY, 
               size: fontSize,
               font: font,
               color: rgb(0, 0, 0),
             });
             currentY -= (fontSize * 1.2); // Jarak spasi per baris text
          }
        } else if (ann.type === "image") {
          let embeddedImage;
          if (ann.content.includes("image/png")) {
            embeddedImage = await pdfDocLib.embedPng(ann.content);
          } else {
            embeddedImage = await pdfDocLib.embedJpg(ann.content);
          }
          
          if (embeddedImage) {
            const imgWidth = (ann.width || 100) / scale;
            const imgHeight = (ann.height || 50) / scale;

            pdfPage.drawImage(embeddedImage, {
              x: xPos,
              y: height - yPos - imgHeight, // Bottom-left coordinate system mapping
              width: imgWidth,
              height: imgHeight,
            });
          }
        }
      }

      const pdfBytes = await pdfDocLib.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      // Pastikan nama file berakhiran .pdf
      const a = document.createElement("a");
      a.href = url;
      const baseName = pdfFile.name.replace(/\.[^/.]+$/, "");
      a.download = `edited_${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Failed to export PDF", e);
      alert("Failed to export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };


  if (!pdfFile) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <label className="flex h-64 w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80">
          <Upload className="mb-4 h-12 w-12 text-slate-400" />
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Click or drag to upload a PDF
          </p>
          <p className="text-xs text-slate-500">Maximum file size 10MB</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>
    );
  }

  const currentAnnotations = annotations.filter((a) => a.page === currentPage);

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 relative overflow-hidden">
      {/* Floating Glassmorphism Toolbar */}
      <div className="absolute top-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-white/80 px-6 py-4 shadow-2xl backdrop-blur-xl border border-white/40 dark:bg-slate-900/80 dark:border-slate-700/50">
        
        {/* Upload New / Clear */}
        <button
          onClick={handleClear}
          className="group flex w-20 flex-col items-center justify-center gap-2 rounded-xl p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title={`Active file: ${pdfFile.name}`}
        >
          <Upload className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wide">Upload</span>
        </button>

        <div className="mx-2 h-10 w-[1px] bg-slate-200 dark:bg-slate-700/50"></div>

        {/* Add Text */}
        <button
          onClick={addText}
          className="group flex w-20 flex-col items-center justify-center gap-2 rounded-xl p-2 text-slate-500 transition-all hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
        >
          <Type className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wide">Add Text</span>
        </button>
        
        {/* Sign (Image) - Highlighted to match mockup */}
        <label className="group flex w-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-blue-500 p-2 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-600 hover:-translate-y-0.5">
          <PenTool className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wide">Sign</span>
          <input
            type="file"
            accept="image/png, image/jpeg"
            className="hidden"
            onChange={handleImageUpload}
          />
        </label>

        <div className="mx-2 h-10 w-[1px] bg-slate-200 dark:bg-slate-700/50"></div>

        {/* Delete Annotations? Let's just keep Download/Save */}
        <button
          onClick={downloadPdf}
          disabled={isExporting}
          className="group flex w-20 flex-col items-center justify-center gap-2 rounded-xl p-2 text-slate-500 transition-all hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
        >
          <Save className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wide">
            {isExporting ? "Saving..." : "Save"}
          </span>
        </button>
      </div>

      {/* Editor Area */}
      <div className="hide-scrollbar flex-1 overflow-auto pt-36 pb-20 px-4">
        <div className="flex min-h-full items-start justify-center">
          <div
            ref={containerRef}
            className="relative shadow-xl transition-all duration-200"
            style={{ 
              width: canvasRef.current?.width ?? 0, 
              height: canvasRef.current?.height ?? 0,
              backgroundColor: 'white'
            }}
          >
            {/* The PDF Canvas */}
            <canvas ref={canvasRef} className="block" />

            {/* Overlays / Annotations */}
            {currentAnnotations.map((ann) => (
              <Rnd
                key={ann.id}
                position={{ x: ann.x, y: ann.y }}
                size={ann.type === "image" ? { width: ann.width || 100, height: ann.height || 50 } : undefined}
                enableResizing={ann.type === "image"} // Allow resizing only for images
                onDragStop={(e, d) => {
                  updateAnnotation(ann.id, { x: d.x, y: d.y });
                }}
                onResizeStop={(e, direction, ref, delta, position) => {
                  if (ann.type === "image") {
                    updateAnnotation(ann.id, {
                      width: parseInt(ref.style.width),
                      height: parseInt(ref.style.height),
                      x: position.x,
                      y: position.y
                    });
                  }
                }}
                bounds="parent"
                className="group absolute"
              >
                <div className="relative h-full w-full border border-transparent hover:border-blue-400 border-dashed group">
                  {/* Controls */}
                  <div className="absolute -right-3 -top-6 hidden group-hover:flex items-center gap-2 z-10">
                    {ann.type === "text" && (
                       <div className="flex items-center bg-white rounded-md shadow-md border border-slate-200 overflow-hidden text-xs text-slate-700">
                          <button 
                             onClick={() => updateAnnotation(ann.id, { fontSize: Math.max(8, (ann.fontSize || 16) - 2) })} 
                             className="px-2 py-1.5 hover:bg-slate-100 border-r border-slate-200 font-bold"
                             title="Perkecil Font"
                          >
                             A-
                          </button>
                          <span className="px-2 cursor-default font-medium">{ann.fontSize || 16}px</span>
                          <button 
                             onClick={() => updateAnnotation(ann.id, { fontSize: Math.min(72, (ann.fontSize || 16) + 2) })} 
                             className="px-2 py-1.5 hover:bg-slate-100 border-l border-slate-200 font-bold"
                             title="Perbesar Font"
                          >
                             A+
                          </button>
                       </div>
                    )}
                    <button
                      onClick={() => deleteAnnotation(ann.id)}
                      className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 shadow-md"
                      title="Hapus"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {ann.type === "text" ? (
                    <textarea
                      value={ann.content}
                      onChange={(e) => {
                         // Auto adjust height using scroll height
                         e.target.style.height = 'auto';
                         e.target.style.height = e.target.scrollHeight + 'px';
                         updateAnnotation(ann.id, { content: e.target.value });
                      }}
                      className="w-full min-w-[150px] min-h-[40px] resize-x overflow-hidden border-none bg-transparent p-1 outline-none font-sans"
                      style={{ 
                        transform: `scale(${scale})`, 
                        transformOrigin: 'top left',
                        color: 'black',
                        fontSize: `${ann.fontSize || 16}px`,
                        whiteSpace: 'pre', // Explicit newline matches pdf wrapping
                        lineHeight: '1.2'
                      }}
                      placeholder="Ketik teks di sini (Enter untuk baris baru)"
                      onFocus={(e) => {
                         e.target.style.height = 'auto';
                         e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      autoFocus
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ann.content}
                      alt="Signature"
                      className="h-full w-full object-contain pointer-events-none"
                    />
                  )}
                </div>
              </Rnd>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Pagination Bottom Right */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-1 rounded-xl bg-white/90 p-1.5 shadow-lg backdrop-blur-md border border-slate-200/60 dark:bg-slate-800/90 dark:border-slate-700/60 transition-all">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[5.5rem] px-2 text-center text-sm font-medium text-slate-700 dark:text-slate-200">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

    </div>
  );
}
