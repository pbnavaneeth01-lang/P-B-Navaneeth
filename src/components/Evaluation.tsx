import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { EvaluationQuestion } from "../types";

// Helper to load PDF.js dynamically
let pdfjsLib: any = null;
const loadPdfjs = async () => {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  return pdfjsLib;
};

interface BookletAnnotatorProps {
  bookletUrl: string;
  questions: EvaluationQuestion[];
}

export const BookletAnnotator = React.memo(({ bookletUrl, questions }: BookletAnnotatorProps) => {
  const [pages, setPages] = useState<{ url: string; width: number; height: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const objectUrls: string[] = [];

    const loadBooklet = async () => {
      if (!bookletUrl) return;
      setLoading(true);
      
      // Cleanup previous URLs
      objectUrls.forEach(url => URL.revokeObjectURL(url));
      objectUrls.length = 0;
      setPages([]);

      try {
        if (bookletUrl.startsWith('data:application/pdf') || bookletUrl.includes('.pdf') || bookletUrl.includes('firebasestorage.googleapis.com')) {
          const pdfjs = await loadPdfjs();
          const loadingTask = pdfjs.getDocument(bookletUrl);
          const pdf = await loadingTask.promise;
          const pageResults: { url: string; width: number; height: number }[] = new Array(pdf.numPages);
          
          // Render pages with a concurrency of 3 to avoid blocking the UI
          const renderQueue = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
          const concurrency = 3;
          let finished = 0;

          const renderPage = async (pageIdx: number) => {
            if (!isMounted) return;
            const page = await pdf.getPage(pageIdx);
            const viewport = page.getViewport({ scale: 1.5 }); // Higher quality for annotation tracking
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context!, viewport, canvas: canvas as any }).promise;
            
            return new Promise<{ url: string; width: number; height: number }>((resolve) => {
              canvas.toBlob((blob) => {
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  objectUrls.push(url);
                  resolve({ url, width: viewport.width, height: viewport.height });
                }
              }, 'image/jpeg', 0.85);
            });
          };

          // Process in parallel batches
          for (let i = 0; i < renderQueue.length; i += concurrency) {
            if (!isMounted) break;
            const batch = renderQueue.slice(i, i + concurrency);
            const results = await Promise.all(batch.map(idx => renderPage(idx)));
            
            results.forEach((res, index) => {
              if (res) pageResults[renderQueue[i + index] - 1] = res;
            });

            finished += batch.length;
            setPages([...pageResults.filter(Boolean)]);
          }
        } else {
          setPages([{ url: bookletUrl, width: 0, height: 0 }]);
        }
      } catch (err) {
        console.error("Error loading booklet:", err);
        if (isMounted) {
          setPages([]);
          setError("Failed to fetch booklet. This may be due to CORS restrictions or an invalid URL.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadBooklet();
    return () => { 
      isMounted = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [bookletUrl]);

  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-4 bg-slate-900 border border-rose-900/30 rounded-[32px]">
        <div className="p-4 bg-rose-500/10 rounded-full">
          <Loader2 className="w-8 h-8 text-rose-500" />
        </div>
        <div className="text-center px-6">
          <p className="text-rose-400 font-bold tracking-tight">Initialization Failed</p>
          <p className="text-slate-500 text-xs mt-1 max-w-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (loading && pages.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-6 bg-slate-900 border border-slate-800 rounded-[32px] animate-pulse">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-white font-bold tracking-tight">Loading Booklet</p>
          <p className="text-slate-500 text-xs">Optimizing View...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 mt-20 pt-20 border-t border-slate-800/60 relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
             <div className="w-1 h-8 bg-blue-600 rounded-full" />
             <h3 className="text-3xl font-display font-black text-white italic tracking-tighter leading-none">Submission View</h3>
          </div>
          <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">Page {pages.length}</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.2em] bg-slate-950/50 backdrop-blur-xl px-5 py-3 rounded-2xl border border-slate-800/60 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400">AI Active</span>
          </div>
          <div className="w-px h-3 bg-slate-800" />
          <span>Optimized View</span>
        </div>
      </div>
      
      <div className="space-y-16">
        {pages.map((page, idx) => (
          <div key={idx} className="group relative border border-slate-800/80 rounded-[48px] overflow-hidden bg-slate-950 shadow-[0_40px_100px_rgba(0,0,0,0.6)] transition-all hover:border-blue-500/40 p-1">
            <div className="relative rounded-[46px] overflow-hidden bg-white">
              <img 
                src={page.url} 
                alt={`Page ${idx + 1}`} 
                className="w-full h-auto select-none opacity-90 group-hover:opacity-100 transition-opacity duration-700" 
                referrerPolicy="no-referrer" 
                loading="lazy"
              />
              <div className="absolute top-6 left-6 px-4 py-2 bg-slate-900/80 backdrop-blur-md rounded-xl text-[10px] font-mono font-bold text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                Page: {idx + 1}
              </div>
            </div>

            {questions.filter(q => q.pageNumber === idx + 1).map((q, qIdx) => {
              if (!q.boundingBox) return null;
              const [ymin, xmin, ymax, xmax] = q.boundingBox;
              const isFullMarks = q.marksAwarded === q.maxMarks;
              const isZeroMarks = q.marksAwarded === 0;
              
              return (
                <div 
                  key={qIdx}
                  className={cn(
                    "absolute rounded-lg pointer-events-none flex flex-col items-start border-2 shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-500 group-hover:scale-[1.01]",
                    isFullMarks ? "border-emerald-500 bg-emerald-500/5 shadow-emerald-500/10" : 
                    isZeroMarks ? "border-rose-500 bg-rose-500/5 shadow-rose-500/10" : 
                    "border-amber-500 bg-amber-500/5 shadow-amber-500/10"
                  )}
                  style={{
                    top: `calc(${ymin / 10}% + 4px)`,
                    left: `calc(${xmin / 10}% + 4px)`,
                    width: `calc(${(xmax - xmin) / 10}% - 8px)`,
                    height: `calc(${(ymax - ymin) / 10}% - 8px)`,
                  }}
                >
                  <div className={cn(
                    "px-2.5 py-1 rounded-br-xl rounded-tl-md text-[10px] font-black text-white shadow-xl flex items-center gap-2",
                    isFullMarks ? "bg-emerald-600" : isZeroMarks ? "bg-rose-600" : "bg-amber-600"
                  )}>
                    <span className="opacity-50 font-mono">Q{q.questionNumber}</span>
                    <span className="w-1 h-3 bg-white/30 rounded-full" />
                    <span>{q.marksAwarded} / {q.maxMarks}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
