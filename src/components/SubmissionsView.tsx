import React from "react";
import { 
  Plus,
  ArrowLeft,
  ChevronRight,
  Upload,
  Download,
  Sparkles,
  Trash2,
  Users,
  Search,
  FileText,
  Loader2, 
  BrainCircuit,
  CheckCircle,
  AlertCircle,
  Cpu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Exam, Submission } from "../types";
import { cn } from "../lib/utils";

// --- Submission Item ---

export const SubmissionItem = React.memo(({ 
  submission, 
  onEvaluate,
  onDelete,
  isSelected,
  onToggleSelect
}: { 
  submission: Submission; 
  onEvaluate: () => void;
  onDelete: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) => (
  <motion.div 
    layout
    className={cn(
      "p-6 rounded-[32px] bg-slate-900/40 border transition-all flex flex-col sm:flex-row items-center gap-6 group overflow-hidden relative",
      isSelected ? "border-blue-500 bg-blue-500/5 shadow-[0_0_40px_rgba(59,130,246,0.1)]" : "border-slate-800/60 hover:border-slate-700 backdrop-blur-xl"
    )}
  >
    <AnimatePresence>
      {isSelected && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-blue-500/5 pointer-events-none"
        />
      )}
    </AnimatePresence>

    <div className="flex items-center gap-4 relative z-10">
      {onToggleSelect && (
        <label className="cursor-pointer">
          <input 
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="hidden"
          />
          <div className={cn(
            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
            isSelected ? "bg-blue-600 border-blue-500" : "bg-slate-800 border-slate-700 hover:border-slate-600"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full bg-white transition-transform duration-300",
              isSelected ? "scale-100" : "scale-0"
            )} />
          </div>
        </label>
      )}
      <div className={cn(
        "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl transition-transform duration-500 group-hover:rotate-3",
        submission.status === "evaluated" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
      )}>
        {submission.status === "evaluated" ? <CheckCircle className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
      </div>
    </div>
    
    <div className="flex-1 text-center sm:text-left min-w-0 relative z-10">
      <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
        <h4 className="font-bold text-white text-xl truncate tracking-tight">{submission.studentName}</h4>
        <span className={cn(
          "px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest border",
          submission.status === "evaluated" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"
        )}>
          {submission.status}
        </span>
      </div>
      <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 font-mono text-[10px]">
        <span className="text-slate-500 uppercase tracking-widest">{new Date(submission.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <div className="w-1 h-1 rounded-full bg-slate-800" />
        <span className="text-slate-600 uppercase tracking-widest">{submission.pageCount || 0} Pages Ingested</span>
      </div>
    </div>

    {submission.status === "evaluated" && (
      <div className="bg-slate-950/50 px-8 py-4 rounded-3xl border border-slate-800/50 shadow-inner flex flex-col items-center justify-center relative z-10">
        <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Normalized Score</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-blue-400 font-black text-3xl tracking-tighter leading-none">{submission.totalMarks}</span>
          <span className="text-slate-700 font-mono text-xs">/</span>
          <span className="text-slate-500 font-bold text-sm">{submission.maxMarks}</span>
        </div>
      </div>
    )}

    <div className="flex items-center gap-3 w-full sm:w-auto relative z-10">
      <button 
        onClick={onEvaluate}
        className={cn(
          "flex-1 sm:flex-none px-8 py-4 rounded-[18px] font-black uppercase tracking-widest text-[10px] transition-all duration-300 shadow-2xl active:scale-95 whitespace-nowrap",
          submission.status === "evaluated" 
            ? "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700" 
            : "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20"
        )}
      >
        {submission.status === "evaluated" ? "Review Batch" : "Execute AI Evaluation"}
      </button>
      <a 
        href={submission.bookletUrl}
        target={submission.bookletUrl.startsWith('data:') ? undefined : "_blank"}
        rel="noopener noreferrer"
        download={`Submission_${submission.studentName}.pdf`}
        className="p-4 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-2xl transition-all shadow-inner border border-transparent hover:border-blue-500/20"
        title="Download Node Data"
      >
        <Download className="w-5 h-5" />
      </a>
      <button 
        onClick={onDelete}
        className="p-4 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-2xl transition-all shadow-inner border border-transparent hover:border-rose-500/20"
        title="Flush Record"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  </motion.div>
));

export const SubmissionsView = React.memo(({ 
  exam, 
  submissions, 
  onNavigate,
  onBulkEvaluate,
  onSingleEvaluate,
  onAddSubmission,
  onBulkAddSubmissions,
  onExportCSV,
  onDeleteSubmission,
  onBulkStatusUpdate,
  isEvaluating,
  isOnline
}: { 
  exam: Exam | undefined; 
  submissions: Submission[]; 
  onNavigate: (feature: any) => void;
  onBulkEvaluate: () => void;
  onSingleEvaluate: (sub: Submission) => void;
  onAddSubmission: () => void;
  onBulkAddSubmissions: () => void;
  onExportCSV: () => void;
  onDeleteSubmission: (id: string) => void;
  onBulkStatusUpdate?: (ids: string[], status: "pending" | "evaluated") => void;
  isEvaluating: boolean;
  isOnline: boolean;
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  
  const filtered = submissions.filter(s => 
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = React.useMemo(() => {
    const total = submissions.length;
    const evaluated = submissions.filter(s => s.status === "evaluated").length;
    const pending = total - evaluated;
    const scores = submissions.filter(s => s.status === "evaluated").map(s => (s.totalMarks || 0) / (s.maxMarks || 1) * 100);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    
    return { total, evaluated, pending, avgScore };
  }, [submissions]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(s => s.id!));
    }
  };

  const handleBulkStatus = (status: "pending" | "evaluated") => {
    if (onBulkStatusUpdate && selectedIds.length > 0) {
      onBulkStatusUpdate(selectedIds, status);
      setSelectedIds([]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto space-y-12"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="flex items-start gap-6">
          <button 
            onClick={() => onNavigate("exams")} 
            className="mt-2 p-4 bg-slate-900/50 backdrop-blur-xl border border-slate-800 text-slate-500 hover:text-white rounded-[20px] transition-all group active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <div className="w-1 h-10 bg-blue-600 rounded-full" />
               <div>
                  <h1 className="text-4xl font-display font-black text-white italic tracking-tighter leading-none">{exam?.title || "Exam Submissions"}</h1>
                  <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2">Submission Ingestion Pipeline</p>
               </div>
            </div>
            <p className="text-slate-400 font-medium max-w-xl leading-relaxed text-sm">Managing the secure intake and semantic analysis of student response booklets for consolidated grading.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl px-5 py-3 transition-colors hover:border-blue-500/30">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                onChange={toggleSelectAll}
                className="hidden"
              />
               <div className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300",
                (selectedIds.length > 0 && selectedIds.length === filtered.length) ? "bg-blue-600 border-blue-500" : "bg-slate-800 border-slate-700 group-hover:border-slate-600"
              )}>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full bg-white transition-transform duration-300",
                  (selectedIds.length > 0 && selectedIds.length === filtered.length) ? "scale-100" : "scale-0"
                )} />
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none group-hover:text-slate-300 transition-colors">Select All Nodes</span>
            </label>
          </div>
          <div className="hidden sm:flex items-center gap-1 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
            {["Newest", "Name", "Score"].map((tab) => (
              <button key={tab} className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                tab === "Newest" ? "bg-blue-600/10 text-blue-400" : "text-slate-500 hover:text-slate-300"
              )}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: "Total Students", value: stats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
          { label: "AI Processed", value: stats.evaluated, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-400/10" },
          { label: "Review Queue", value: stats.pending, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-400/10" },
          { label: "Aggregate %", value: `${stats.avgScore}%`, icon: BrainCircuit, color: "text-purple-400", bg: "bg-purple-400/10" },
        ].map((item, i) => (
          <div key={i} className="p-6 rounded-[32px] border border-slate-800/60 bg-slate-900/40 backdrop-blur-xl flex flex-col gap-4 group">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", item.bg, item.color.replace('text-', 'border-').replace('400', '500').concat('/20'))}>
              <item.icon className="w-6 h-6 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <div>
              <p className="text-[10px] font-mono font-black text-slate-600 uppercase tracking-[0.2em] mb-1">{item.label}</p>
              <p className="text-2xl font-black text-white leading-none">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-6"
          >
            <div className="bg-slate-950/80 border border-blue-500/20 rounded-[40px] p-5 flex items-center justify-between shadow-[0_20px_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl ring-1 ring-white/5">
              <div className="flex items-center gap-5 ml-3">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/20">
                  {selectedIds.length}
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-widest">Active Selection</p>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Bulk Matrix Operations</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pr-1">
                <button 
                  onClick={() => handleBulkStatus("evaluated")}
                  className="px-5 py-3 bg-emerald-600/10 border border-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-600 hover:text-white transition-all outline-none"
                >
                  Mark Final
                </button>
                <button 
                  onClick={() => handleBulkStatus("pending")}
                  className="px-5 py-3 bg-orange-600/10 border border-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-orange-600 hover:text-white transition-all outline-none"
                >
                  Reset Status
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedIds.length} submissions? This operation is IRREVERSIBLE.`)) {
                      selectedIds.forEach(id => onDeleteSubmission(id));
                      setSelectedIds([]);
                    }
                  }}
                  className="p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-2xl transition-all"
                  title="Purge Selection"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="w-px h-8 bg-slate-800 mx-2" />
                <button 
                  onClick={() => setSelectedIds([])}
                  className="p-3 text-slate-500 hover:text-white bg-slate-900 rounded-2xl border border-slate-800 transition-colors"
                  aria-label="Cancel Selection"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 p-2 bg-slate-950/20 rounded-[28px] border border-slate-800/40">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text"
                placeholder="Lookup student ID or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/50 border-none rounded-[22px] py-4 pl-14 pr-6 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all font-medium text-base"
              />
            </div>
            <button 
              onClick={onAddSubmission} 
              className="w-full sm:w-auto h-14 px-10 bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] rounded-[22px] hover:bg-blue-500 transition-all flex items-center justify-center gap-3 whitespace-nowrap shadow-xl shadow-blue-500/10 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              New Record
            </button>
          </div>
          
          <div className="space-y-4">
            {filtered.map(sub => (
              <SubmissionItem 
                key={sub.id} 
                submission={sub} 
                onEvaluate={() => onSingleEvaluate(sub)} 
                onDelete={() => onDeleteSubmission(sub.id!)} 
                isSelected={selectedIds.includes(sub.id!)}
                onToggleSelect={() => toggleSelect(sub.id!)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 bg-slate-900/10 border-2 border-dashed border-slate-800 rounded-[48px] text-slate-500 group cursor-default">
                <div className="w-24 h-24 bg-slate-800/30 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-700">
                  <FileText className="w-12 h-12 opacity-20" />
                </div>
                <p className="text-xl font-bold text-slate-400 italic">
                  {searchQuery ? "No matching identifiers found." : "Node database is empty."}
                </p>
                <p className="text-xs uppercase font-mono tracking-widest mt-3 text-slate-600">
                   System ready for content ingestion.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Sidebar */}
        <div className="space-y-8">
          <div className="p-8 rounded-[40px] bg-slate-900/40 border border-slate-800/60 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none rotate-12">
               <Cpu className="w-48 h-48" />
            </div>
            <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.3em] mb-8 px-1">Pipeline Control</h4>
            <div className="space-y-4">
              <button 
                onClick={onBulkEvaluate}
                disabled={isEvaluating || !isOnline || submissions.length === 0}
                className="w-full group/btn flex items-center gap-5 p-6 rounded-[28px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black hover:scale-[1.02] transition-all disabled:opacity-50 shadow-2xl shadow-blue-500/20 active:scale-95 outline-none"
              >
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner group-hover/btn:rotate-6 transition-transform">
                  {isEvaluating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                </div>
                <div className="text-left">
                  <p className="text-xs uppercase tracking-widest">Execute Bulk</p>
                  <p className="text-[10px] text-blue-200/50 font-mono mt-1">Parallel AI Matrix</p>
                </div>
              </button>
              
              <button 
                onClick={onBulkAddSubmissions}
                disabled={!isOnline}
                className="w-full group/btn flex items-center gap-5 p-6 rounded-[28px] bg-slate-800/50 border border-slate-700/50 text-white font-black hover:bg-slate-700/50 hover:border-slate-600 transition-all disabled:opacity-50 outline-none"
              >
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-slate-500 group-hover/btn:text-white shadow-inner transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="text-xs uppercase tracking-widest">Batch Ingest</p>
                  <p className="text-[10px] text-slate-600 font-mono mt-1">ZIP / Multiple Nodes</p>
                </div>
              </button>

              <button 
                onClick={onExportCSV}
                className="w-full group/btn flex items-center gap-5 p-6 rounded-[28px] bg-emerald-600/5 border border-emerald-600/10 text-emerald-400 font-black hover:bg-emerald-600/10 hover:border-emerald-500/30 transition-all outline-none"
              >
                <div className="w-12 h-12 bg-emerald-600/10 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover/btn:scale-110">
                  <Download className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="text-xs uppercase tracking-widest">Data Export</p>
                  <p className="text-[10px] text-emerald-600/40 font-mono mt-1">CSV Graded Matrix</p>
                </div>
              </button>
            </div>
          </div>
          
          <div className="p-10 rounded-[40px] bg-indigo-600/10 border border-indigo-500/10 flex flex-col items-center text-center group cursor-default">
             <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform duration-700">
                <BrainCircuit className="w-10 h-10 text-indigo-400" />
             </div>
             <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Semantic Core Active</p>
             <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">The AI interface is calibrated and ready for high-concurrency evaluation of OCR-converted booklets.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
