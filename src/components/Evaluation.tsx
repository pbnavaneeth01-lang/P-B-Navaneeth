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

  if (loading && pages.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-6 bg-slate-900 border border-slate-800 rounded-[32px] animate-pulse">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-white font-bold tracking-tight">Rendering Booklet</p>
          <p className="text-slate-500 text-xs">AI-Optimized Viewport Rasterization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 mt-16 pt-16 border-t border-slate-800/50">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-black text-white tracking-tight">Evaluated Script</h3>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Annotation Overlay
        </div>
      </div>
      
      <div className="space-y-12">
        {pages.map((page, idx) => (
          <div key={idx} className="group relative border border-slate-800 rounded-[40px] overflow-hidden bg-white shadow-2xl transition-all hover:border-blue-500/30">
            <img 
              src={page.url} 
              alt={`Page ${idx + 1}`} 
              className="w-full h-auto select-none" 
              referrerPolicy="no-referrer" 
              loading="lazy"
            />
            {questions.filter(q => q.pageNumber === idx + 1).map((q, qIdx) => {
              if (!q.boundingBox) return null;
              const [ymin, xmin, ymax, xmax] = q.boundingBox;
              const isFullMarks = q.marksAwarded === q.maxMarks;
              const isZeroMarks = q.marksAwarded === 0;
              
              return (
                <div 
                  key={qIdx}
                  className={cn(
                    "absolute border-2 rounded pointer-events-none flex flex-col items-start",
                    isFullMarks ? "border-green-500 bg-green-500/10" : isZeroMarks ? "border-red-500 bg-red-500/10" : "border-amber-500 bg-amber-500/10"
                  )}
                  style={{
                    top: `${ymin / 10}%`,
                    left: `${xmin / 10}%`,
                    width: `${(xmax - xmin) / 10}%`,
                    height: `${(ymax - ymin) / 10}%`,
                  }}
                >
                  <div className={cn(
                    "px-1.5 py-0.5 rounded-br text-[10px] font-bold text-white shadow-sm",
                    isFullMarks ? "bg-green-500" : isZeroMarks ? "bg-red-500" : "bg-amber-500"
                  )}>
                    Q{q.questionNumber}: {q.marksAwarded}/{q.maxMarks}
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
