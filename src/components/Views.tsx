import React from "react";
import { 
  BookOpen, 
  FileCheck, 
  CheckCircle, 
  AlertCircle,
  Plus,
  ArrowLeft,
  ChevronRight,
  Upload,
  Download,
  Info,
  ShieldCheck,
  Cpu,
  Sparkles,
  Edit2,
  Trash2,
  Users,
  Search,
  Filter,
  FileText,
  Loader2, 
  GraduationCap, 
  BrainCircuit,
  BookMarked
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StatCard } from "./Common";
import { Exam, Submission, EvaluationQuestion } from "../types";
import { cn } from "../lib/utils";

// --- Dashboard ---

export const DashboardView = React.memo(({ 
  stats, 
  onNavigate 
}: { 
  stats: any; 
  onNavigate: (feature: any, examId?: string) => void 
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-12"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-4xl font-black text-white tracking-tight">
              Exam Insights
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest mt-1">
              v2.2.1
            </span>
          </div>
          <p className="text-slate-400 text-lg font-medium">Real-time performance analytics across all assessments.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Exams" value={stats.totalExams} icon={BookOpen} color="bg-blue-600" />
        <StatCard title="Submissions" value={stats.totalSubmissions} icon={FileCheck} color="bg-purple-600" />
        <StatCard title="Evaluated" value={stats.evaluated} icon={CheckCircle} color="bg-green-600" />
        <StatCard title="Pending" value={stats.pending} icon={AlertCircle} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 rounded-[32px] bg-slate-900 border border-slate-800 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6">Recent Exams</h2>
          <div className="space-y-4">
            {stats.recentExams.map((exam: any) => (
              <button 
                key={exam.id}
                onClick={() => onNavigate("submissions", exam.id)}
                className="group w-full p-4 rounded-2xl bg-slate-800/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">{exam.title}</p>
                    <p className="text-xs text-slate-500">{new Date(exam.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
              </button>
            ))}
            {stats.totalExams === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-slate-500 mb-6">No exams created yet.</p>
                <button 
                  onClick={() => onNavigate("exams")}
                  className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Exam</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 rounded-[32px] bg-slate-900 border border-slate-800 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6">Pending Evaluations</h2>
          <div className="space-y-4">
            {stats.recentPending.map((sub: any) => (
              <div key={sub.id} className="p-4 rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200">{sub.studentName}</p>
                    <p className="text-xs text-slate-500">Waiting for review</p>
                  </div>
                </div>
                <button 
                  onClick={() => onNavigate("submissions", sub.examId)}
                  className="px-4 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  View
                </button>
              </div>
            ))}
            {stats.pending === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
                <CheckCircle className="w-10 h-10 text-emerald-500/20 mb-4" />
                <p>All clear! No pending submissions.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// --- Exams List Item ---

export const ExamItem = React.memo(({ 
  exam, 
  onSelect,
  onEdit,
  onDelete,
  onManageStudents
}: { 
  exam: Exam; 
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageStudents: () => void;
}) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="group relative h-full flex flex-col p-6 rounded-[32px] bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all duration-300"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
        <BookOpen className="w-6 h-6" />
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <h3 className="text-xl font-bold text-white mb-2 line-clamp-1 group-hover:text-blue-400 transition-colors">{exam.title}</h3>
    <p className="text-slate-500 text-sm mb-6 flex items-center gap-2 font-medium">
      <Users className="w-4 h-4 text-blue-500/50" />
      {exam.studentList?.length || 0} Students enrolled
    </p>

    <div className="mt-auto space-y-3">
      <button 
        onClick={onSelect}
        className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 active:scale-95"
      >
        Submissions
      </button>
      <button 
        onClick={onManageStudents}
        className="w-full py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all text-sm font-semibold"
      >
        Manage Students
      </button>
    </div>
  </motion.div>
));

// --- Submissions View ---

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
  isEvaluating: boolean;
  isOnline: boolean;
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const stats = React.useMemo(() => {
    const total = submissions.length;
    const evaluated = submissions.filter(s => s.status === "evaluated").length;
    const pending = total - evaluated;
    const scores = submissions.filter(s => s.status === "evaluated").map(s => (s.totalMarks || 0) / (s.maxMarks || 1) * 100);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    
    return { total, evaluated, pending, avgScore };
  }, [submissions]);

  const filtered = submissions.filter(s => 
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button onClick={() => onNavigate("exams")} className="p-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-2xl transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-black text-white tracking-tight">{exam?.title || "Exam Submissions"}</h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live v2.2.1
              </div>
            </div>
            <p className="text-slate-400 font-medium">Monitoring academic integrity and performance.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button className="px-3 py-1.5 bg-slate-800 text-white text-xs font-black rounded-lg">Newest</button>
            <button className="px-3 py-1.5 text-slate-500 text-xs font-black hover:text-slate-300">Name</button>
            <button className="px-3 py-1.5 text-slate-500 text-xs font-black hover:text-slate-300">Score</button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Students", value: stats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-400/5" },
          { label: "AI Evaluated", value: stats.evaluated, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-400/5" },
          { label: "Pending Review", value: stats.pending, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-400/5" },
          { label: "Avg. Performance", value: `${stats.avgScore}%`, icon: BrainCircuit, color: "text-purple-400", bg: "bg-purple-400/5" },
        ].map((item, i) => (
          <div key={i} className={cn("p-4 rounded-2xl border border-slate-800/60 bg-slate-900/50 flex items-center gap-4")}>
            <div className={cn("p-2.5 rounded-xl", item.bg, item.color)}>
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</p>
              <p className="text-xl font-black text-white">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <button 
              onClick={onAddSubmission} 
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Submission
            </button>
          </div>
          
          <div className="space-y-4">
            {filtered.map(sub => (
              <SubmissionItem 
                key={sub.id} 
                submission={sub} 
                onEvaluate={() => onSingleEvaluate(sub)} 
                onDelete={() => onDeleteSubmission(sub.id!)} 
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-900/30 border border-dashed border-slate-800 rounded-[32px] text-slate-500">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-bold text-slate-400">
                  {searchQuery ? "No matching students found." : "No submissions available."}
                </p>
                <p className="text-sm">Start by uploading answer booklets for this exam.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="p-6 rounded-[32px] bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest px-1">Quick Actions</h4>
            <div className="space-y-3">
              <button 
                onClick={onBulkEvaluate}
                disabled={isEvaluating || !isOnline || submissions.length === 0}
                className="w-full group flex items-center gap-4 p-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-900/20"
              >
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <p className="text-sm">Bulk Evaluate</p>
                  <p className="text-[10px] text-blue-200/70 font-medium">Parallel AI Processing</p>
                </div>
              </button>
              
              <button 
                onClick={onBulkAddSubmissions}
                disabled={!isOnline}
                className="w-full group flex items-center gap-4 p-4 rounded-2xl bg-slate-800 border border-slate-700 text-white font-bold hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-white">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm">Upload Batch</p>
                  <p className="text-[10px] text-slate-500 font-medium">ZIP or Multi-File</p>
                </div>
              </button>

              <button 
                onClick={onExportCSV}
                className="w-full group flex items-center gap-4 p-4 rounded-2xl bg-emerald-600/5 border border-emerald-600/10 text-emerald-400 font-bold hover:bg-emerald-600/10 transition-all"
              >
                <div className="w-8 h-8 bg-emerald-600/10 rounded-lg flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm">Export CSV</p>
                  <p className="text-[10px] text-emerald-600/50 font-medium">Grades Metadata</p>
                </div>
              </button>
            </div>
          </div>

          <div className="p-6 rounded-[32px] bg-slate-900/50 border border-slate-800/50 space-y-4">
            <div className="flex items-center gap-3 text-slate-400">
              <Info className="w-4 h-4" />
              <h4 className="text-xs font-black uppercase tracking-widest">Grading Guide</h4>
            </div>
            <ul className="space-y-4">
              {[
                "Bulk evaluate is 3x faster than manual review.",
                "Ensure scans are clear for better OCR results.",
                "Auto-extracted names can be edited manually.",
                "Verify questions marked with low confidence."
              ].map((tip, i) => (
                <li key={i} className="flex gap-3 text-xs text-slate-500 leading-relaxed">
                  <span className="text-blue-500 font-bold">0{i+1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// --- Submission Item ---

export const SubmissionItem = React.memo(({ 
  submission, 
  onEvaluate,
  onDelete
}: { 
  submission: Submission; 
  onEvaluate: () => void;
  onDelete: () => void;
}) => (
  <motion.div 
    layout
    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-center gap-5"
  >
    <div className={cn(
      "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
      submission.status === "evaluated" ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400"
    )}>
      {submission.status === "evaluated" ? <CheckCircle className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
    </div>
    
    <div className="flex-1 text-center sm:text-left min-w-0">
      <h4 className="font-bold text-white text-lg truncate">{submission.studentName}</h4>
      <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
        <span className={cn(
          "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest",
          submission.status === "evaluated" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
        )}>
          {submission.status}
        </span>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">•</span>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{new Date(submission.createdAt).toLocaleDateString()}</span>
      </div>
    </div>

    {submission.status === "evaluated" && (
      <div className="bg-slate-800 px-6 py-3 rounded-2xl border border-slate-700 shadow-inner flex flex-col items-center justify-center">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Score</p>
        <div className="flex items-baseline gap-1">
          <span className="text-emerald-400 font-black text-2xl tracking-tighter">{submission.totalMarks}</span>
          <span className="text-slate-600 font-bold">/</span>
          <span className="text-slate-400 font-bold text-sm">{submission.maxMarks}</span>
        </div>
      </div>
    )}

    <div className="flex items-center gap-3 w-full sm:w-auto">
      <button 
        onClick={onEvaluate}
        className={cn(
          "flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold transition-all text-sm shadow-lg",
          submission.status === "evaluated" 
            ? "bg-slate-800 text-white hover:bg-slate-700" 
            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-900/20"
        )}
      >
        {submission.status === "evaluated" ? "Review" : "Evaluate"}
      </button>
      <button 
        onClick={onDelete}
        className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  </motion.div>
));

// --- About View ---

export const AboutView = React.memo(() => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    className="max-w-4xl mx-auto space-y-16 py-8"
  >
    <div className="text-center space-y-4">
      <div className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-600/30">
        <GraduationCap className="w-12 h-12 text-white" />
      </div>
      <h1 className="text-6xl font-black text-white tracking-tighter">GradeMaster AI</h1>
      <p className="text-slate-400 text-xl font-medium max-w-2xl mx-auto">Advanced academic evaluation powered by state-of-the-art vision and language models.</p>
      <div className="flex items-center justify-center gap-4 text-emerald-400 font-bold bg-emerald-400/5 py-2.5 px-8 rounded-full w-max mx-auto border border-emerald-400/10 shadow-lg">
        <ShieldCheck className="w-4 h-4" />
        GradeMaster v2.2.0
      </div>
    </div>

    <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 sm:p-12 space-y-12 shadow-xl">
      <section className="space-y-8">
        <div className="flex items-center gap-3 text-blue-400">
          <BookMarked className="w-6 h-6" />
          <h3 className="text-xl font-bold uppercase tracking-widest">User Manual</h3>
        </div>
        <div className="space-y-8 pl-4 border-l-2 border-slate-800 ml-3">
          {[
            { step: "01", title: "Authentication", desc: "Sign in with Google to secure your data and access your private dashboard." },
            { step: "02", title: "Exams Config", desc: "Create an exam, upload the Question Paper and a detailed Marking Scheme. This is the AI's 'Brain'." },
            { step: "03", title: "Bulk Submission", desc: "Upload student booklets. You can drag and drop multiple images or PDFs at once." },
            { step: "04", title: "AI Evaluation", desc: "The system identifies handwriting and marks each question against the scheme automatically." },
            { step: "05", title: "Final Validation", desc: "The teacher has the final say. You can review and override AI marks if necessary before exporting." }
          ].map((item, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[2.75rem] top-0.5 w-7 h-7 bg-slate-950 border-2 border-slate-800 rounded-full flex items-center justify-center text-xs font-black text-slate-500 shadow-md">
                {item.step}
              </div>
              <h4 className="text-white font-bold text-lg mb-1">{item.title}</h4>
              <p className="text-slate-400 leading-relaxed font-medium">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  </motion.div>
));
