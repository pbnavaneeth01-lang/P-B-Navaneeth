import React, { useState, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

// Helper to load PDF.js dynamically
let pdfjsLib: any = null;
const loadPdfjs = async () => {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  return pdfjsLib;
};

export const PdfViewer = ({ url }: { url: string }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const objectUrls: string[] = [];

    const renderPdf = async () => {
      if (!url) return;
      setLoading(true);
      setError(null);
      setPages([]);
      
      try {
        const isPdf = url.startsWith('data:application/pdf') || url.includes('.pdf') || url.includes('firebasestorage.googleapis.com') || url.startsWith('blob:');
        
        if (isPdf) {
          const pdfjs = await loadPdfjs();
          const loadingTask = pdfjs.getDocument(url);
          const pdf = await loadingTask.promise;
          const renderedPages: string[] = new Array(pdf.numPages);
          
          // Process pages in parallel batches to prevent UI blocking
          const renderQueue = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
          const concurrency = 3;

          const renderPage = async (pageIdx: number) => {
            if (!isMounted) return;
            const page = await pdf.getPage(pageIdx);
            const viewport = page.getViewport({ scale: 1.5 }); // Best balance of high quality and rendering velocity
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context!, viewport }).promise;
            
            return new Promise<string>((resolve) => {
              canvas.toBlob((blob) => {
                if (blob) {
                  const blobUrl = URL.createObjectURL(blob);
                  if (isMounted) {
                    objectUrls.push(blobUrl);
                    resolve(blobUrl);
                  } else {
                    URL.revokeObjectURL(blobUrl);
                    resolve("");
                  }
                } else {
                  resolve("");
                }
              }, 'image/jpeg', 0.85);
            });
          };

          for (let i = 0; i < renderQueue.length; i += concurrency) {
            if (!isMounted) break;
            const batch = renderQueue.slice(i, i + concurrency);
            const results = await Promise.all(batch.map(idx => renderPage(idx)));
            
            results.forEach((blobUrl, index) => {
              if (blobUrl) {
                renderedPages[renderQueue[i + index] - 1] = blobUrl;
              }
            });

            if (isMounted) {
              setPages([...renderedPages.filter(Boolean)]);
            }
          }
        } else {
           // Not a PDF, maybe an image?
           setPages([url]);
        }
      } catch (err: any) {
        console.error("PDF Render Error:", err);
        if (isMounted) setError("Failed to render document. Information might be restricted or corrupted.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    renderPdf();
    return () => { 
      isMounted = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [url]);

  if (loading && pages.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-slate-950/50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Rendering PDF Engine...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-950/50">
        <AlertTriangle className="w-10 h-10 text-rose-500" />
        <p className="text-sm font-bold text-slate-400">{error}</p>
        <button 
          onClick={() => window.open(url, '_blank')}
          className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition-all"
        >
          Open in New Tab
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar bg-slate-950/50">
      {pages.map((pageUrl, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="w-full max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
        >
          <img src={pageUrl} alt={`Page ${idx + 1}`} className="w-full h-auto bg-white" />
        </motion.div>
      ))}
      {loading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      )}
    </div>
  );
};
