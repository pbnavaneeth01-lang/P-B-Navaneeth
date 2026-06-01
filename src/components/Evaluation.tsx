import React, { useState, useEffect } from "react";
import { 
  Loader2,
  Sparkles, 
  CheckCircle, 
  FileCheck, 
  Download, 
  FileText,
  BrainCircuit,
  Layout,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { EvaluationQuestion, Submission, Exam } from "../types";

// Helper to load PDF.js dynamically
let pdfjsLib: any = null;
const loadPdfjs = async () => {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  try {
    const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default || pdfWorker;
  } catch (err) {
    console.warn("Local dynamic worker URL load failed, falling back to CDN:", err);
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  }
  return pdfjsLib;
};

interface BookletAnnotatorProps {
  bookletUrl: string;
  questions: EvaluationQuestion[];
}

export const BookletAnnotator = React.memo(({ bookletUrl, questions }: BookletAnnotatorProps) => {
  const [pages, setPages] = useState<{ url: string; width: number; height: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-12 mt-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
             <div className="w-1 h-8 bg-blue-600 rounded-full" />
             <h3 className="text-3xl font-display font-black text-white italic tracking-tighter leading-none">Booklet Preview</h3>
          </div>
          <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">{pages.length} Pages Loaded</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.2em] bg-slate-950/50 backdrop-blur-xl px-5 py-3 rounded-2xl border border-slate-800/60 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400">AI Annotated</span>
          </div>
          <div className="w-px h-3 bg-slate-800" />
          <span>Interactive View</span>
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

interface EvaluationDetailViewProps {
  submission: Submission;
  exam?: Exam;
  reportRef?: React.RefObject<HTMLDivElement>;
  onExportPDF: () => void;
  onPreview: (url: string, title: string) => void;
  onReevaluate: () => void;
  isEvaluating: boolean;
}

export const EvaluationDetailView = ({
  submission,
  exam,
  reportRef,
  onExportPDF,
  onPreview,
  onReevaluate,
  isEvaluating
}: EvaluationDetailViewProps) => {
  const [activeTab, setActiveTab] = useState<"feedback" | "booklet">("feedback");

  if (!submission.evaluationData) return null;

  return (
    <div className="space-y-10">
      {/* Real-time Status Indicator */}
      <div className="flex items-center justify-end px-4 -mb-4">
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full backdrop-blur-xl shadow-xl">
           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]" />
           <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">Live Sync Enabled</span>
        </div>
      </div>

      {/* Header Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-8 sm:p-10 rounded-[40px] bg-slate-900/40 border border-slate-800/60 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none rotate-12">
             <Sparkles className="w-64 h-64" />
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <BrainCircuit className="w-3 h-3 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">High Precision Engine v1.0.4</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="w-1.5 h-10 bg-blue-600 rounded-full" />
                 <div>
                    <h2 className="text-3xl sm:text-4xl font-display font-black text-white italic tracking-tighter leading-none">{submission.studentName}</h2>
                    <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2">Submission Analysis</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center gap-2">
                   <span className="text-[9px] font-mono font-bold text-blue-400 uppercase tracking-widest">Exam</span>
                   <span className="text-xs font-bold text-white italic truncate max-w-[200px]">{exam?.title || "Exam"}</span>
                </div>
                <div className="px-3 py-1 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center gap-2">
                   <CheckCircle className="w-3 h-3 text-emerald-500" />
                   <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Verified</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/40 p-6 rounded-[28px] border border-slate-800/60 shadow-inner min-w-[160px] flex flex-col items-center justify-center">
              <p className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-slate-600 mb-2">Total Score</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-blue-500 font-black text-4xl tracking-tighter leading-none">{submission.totalMarks}</span>
                <span className="text-slate-800 font-mono text-xl italic">/</span>
                <span className="text-slate-500 font-bold text-lg">{submission.maxMarks}</span>
              </div>
              <div className="w-full h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(submission.totalMarks! / submission.maxMarks!) * 100}%` }}
                  className="h-full bg-blue-500 transition-all duration-1000"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Quick Access */}
        <div className="p-8 rounded-[40px] bg-slate-950/40 border border-slate-800/60 backdrop-blur-3xl flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest px-1">Export & Share</h4>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={onExportPDF} className="p-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl transition-all border border-slate-700 flex flex-col items-center gap-2 group shadow-xl shadow-black/20">
                <Download className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest">Report</span>
              </button>
              <button 
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = submission.bookletUrl;
                  link.download = `Booklet_${submission.studentName}.pdf`;
                  link.click();
                }}
                className="p-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl transition-all border border-slate-700 flex flex-col items-center gap-2 group shadow-xl shadow-black/20"
              >
                <FileText className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest">Booklet</span>
              </button>
            </div>
          </div>
          <button 
            onClick={onReevaluate}
            disabled={isEvaluating}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
          >
            {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            {isEvaluating ? "Regrading..." : "Run AI Again"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-950/50 border border-slate-800/60 rounded-[24px] w-fit">
        <button 
          onClick={() => setActiveTab("feedback")}
          className={cn(
            "px-6 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2",
            activeTab === "feedback" ? "bg-blue-600 text-white shadow-xl shadow-blue-500/20" : "text-slate-500 hover:text-slate-300"
          )}
        >
          <Layout className="w-4 h-4" />
          Feedback List
        </button>
        <button 
          onClick={() => setActiveTab("booklet")}
          className={cn(
            "px-6 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2",
            activeTab === "booklet" ? "bg-blue-600 text-white shadow-xl shadow-blue-500/20" : "text-slate-500 hover:text-slate-300"
          )}
        >
          <BookOpen className="w-4 h-4" />
          Annotated Booklet
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "feedback" ? (
          <motion.div 
            key="feedback"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Overall Summary Row */}
            {submission.evaluationData.summary && (
              <div className="p-8 sm:p-10 rounded-[40px] bg-gradient-to-br from-indigo-600/10 to-blue-600/10 border border-indigo-500/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
                 <div className="flex items-start gap-6 relative z-10">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-500/30">
                       <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="space-y-4">
                       <h3 className="text-xl font-display font-black text-indigo-400 italic tracking-tighter">AI Executive Summary</h3>
                       <p className="text-slate-300 leading-relaxed text-sm font-medium">
                         {submission.evaluationData.summary}
                       </p>
                    </div>
                 </div>
              </div>
            )}

            {/* Questions List */}
            <motion.div 
              ref={reportRef} 
              className="space-y-6"
              initial="hidden"
              animate="show"
              variants={{
                show: {
                  transition: {
                    staggerChildren: 0.1
                  }
                }
              }}
            >
              {submission.evaluationData.questions.map((q, i) => (
                <motion.div 
                  key={i} 
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: { opacity: 1, y: 0 }
                  }}
                  className="group/card p-8 sm:p-10 rounded-[40px] bg-slate-900 border border-slate-800/60 hover:border-blue-500/30 transition-all duration-500 backdrop-blur-xl relative overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-slate-950 rounded-[22px] border border-slate-800 flex items-center justify-center text-blue-500 font-black text-lg shadow-inner group-hover/card:scale-110 group-hover/card:rotate-3 transition-all duration-500">Q{q.questionNumber}</div>
                      <div>
                        <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1">Page {q.pageNumber}</p>
                        <div className="flex items-center gap-2">
                           <div className={cn("w-2 h-2 rounded-full", q.marksAwarded === q.maxMarks ? "bg-emerald-500" : q.marksAwarded === 0 ? "bg-rose-500" : "bg-amber-500")} />
                           <p className="text-xs font-bold text-white font-display italic">
                             {q.marksAwarded === q.maxMarks ? "Full Credit" : q.marksAwarded === 0 ? "No Credit" : "Partial Credit"}
                           </p>
                        </div>
                      </div>
                    </div>
                    <div className="self-start sm:self-auto px-6 py-3 bg-slate-950 rounded-2xl text-base font-black text-blue-400 border border-slate-800/80 flex items-center gap-3 shadow-inner">
                      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-[0.3em] mr-1">Points</span>
                      <span className="text-xl leading-none">{q.marksAwarded}</span>
                      <span className="text-slate-800 font-mono">/</span>
                      <span className="text-slate-500 leading-none">{q.maxMarks}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                    <div className="space-y-4">
                      <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600 flex items-center gap-3 px-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        Transcription
                      </div>
                      <div className="p-6 rounded-[28px] bg-slate-950/60 border border-slate-800/50 min-h-[120px] shadow-inner group-hover/card:bg-slate-950/80 transition-colors">
                        <p className="text-sm text-slate-400 italic leading-relaxed font-medium">"{q.transcription}"</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600 px-1 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                        Examiner Reasoning
                      </div>
                      <div className="p-6 rounded-[28px] bg-purple-500/5 border border-purple-500/10 min-h-[120px] shadow-inner group-hover/card:bg-purple-500/10 transition-colors">
                        <p className="text-sm text-purple-100/70 leading-relaxed font-medium">{q.feedback}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div 
            key="booklet"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <BookletAnnotator 
              bookletUrl={submission.bookletUrl} 
              questions={submission.evaluationData.questions} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

