import React from "react";
import { 
  BookOpen, 
  FileCheck, 
  CheckCircle, 
  AlertCircle,
  Plus,
  ChevronRight,
  FileText,
  Cpu,
  BrainCircuit
} from "lucide-react";
import { motion } from "motion/react";
import { StatCard } from "./Common";

export const DashboardView = React.memo(({ 
  stats, 
  onNavigate,
  onLoadSample
}: { 
  stats: any; 
  onNavigate: (feature: any, examId?: string) => void;
  onLoadSample?: () => Promise<void>;
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-12"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-1.5 h-12 bg-blue-600 rounded-full" />
             <div>
              <h1 className="text-5xl font-display font-black text-white italic tracking-tighter leading-none">
                GradeMaster
              </h1>
              <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2">Evaluation Overview</p>
             </div>
          </div>
          <p className="text-slate-400 text-lg font-medium max-w-xl leading-relaxed">Performance metrics and grading status for exams.</p>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-6 rounded-[28px] technical-border">
          <div className="text-right">
             <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Status</p>
             <p className="text-sm font-black text-emerald-400 uppercase tracking-tight">All Online</p>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
             <CheckCircle className="text-emerald-400 w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Exams" value={stats.totalExams} icon={BookOpen} color="bg-blue-600" />
        <StatCard title="Processed" value={stats.totalSubmissions} icon={FileCheck} color="bg-indigo-600" />
        <StatCard title="Evaluation OK" value={stats.evaluated} icon={CheckCircle} color="bg-emerald-600" />
        <StatCard title="Awaiting" value={stats.pending} icon={AlertCircle} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-10 rounded-[40px] bg-slate-900/40 border border-slate-800/60 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
             <BookOpen className="w-64 h-64" />
          </div>
          
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-2xl font-display font-black text-white italic">Recent Exam Papers</h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Exam List</p>
            </div>
            <button className="text-xs font-black text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors">View All</button>
          </div>

          <div className="space-y-3">
            {stats.recentExams.map((exam: any) => (
              <button 
                key={exam.id}
                onClick={() => onNavigate("submissions", exam.id)}
                className="group w-full p-6 rounded-3xl bg-slate-800/30 border border-slate-800/50 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all duration-300 flex items-center justify-between"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-slate-500 group-hover:text-blue-400 group-hover:scale-110 transition-all duration-500 shadow-inner">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-slate-200 group-hover:text-white transition-colors">{exam.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                       <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">{new Date(exam.createdAt).toLocaleDateString()}</span>
                       <div className="w-1 h-1 rounded-full bg-slate-800" />
                       <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest">Active</span>
                    </div>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center text-slate-600 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </button>
            ))}
            {stats.totalExams === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-800 rounded-[32px]">
                <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center mb-6">
                  <BookOpen className="w-10 h-10 text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium mb-8 max-w-xs leading-relaxed">No exams added yet. Please add an exam to start.</p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button 
                    onClick={() => onNavigate("exams")}
                    className="px-10 py-4 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center gap-3"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Exam</span>
                  </button>
                  {onLoadSample && (
                    <button 
                      onClick={onLoadSample}
                      className="px-10 py-4 bg-slate-800 text-slate-300 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-700 hover:text-white transition-all border border-slate-700 active:scale-95 flex items-center gap-3"
                    >
                      <span>Load Sample Data</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 sm:p-10 rounded-[40px] bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-2xl font-display font-black text-white italic leading-tight">Upcoming Tasks</h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Pending Review</p>
            </div>
            <div className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg">
               <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest">Tasks</span>
            </div>
          </div>

          <div className="space-y-3">
            {stats.recentPending.map((sub: any) => (
              <div key={sub.id} className="p-5 rounded-3xl bg-slate-800/40 border border-slate-800/60 flex items-center justify-between group hover:border-orange-500/30 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-200 truncate">{sub.studentName}</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Awaiting Review</p>
                  </div>
                </div>
                <button 
                  onClick={() => onNavigate("submissions", sub.examId)}
                  className="px-5 py-2 bg-slate-800 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all shadow-lg"
                >
                  Process
                </button>
              </div>
            ))}
            {stats.pending === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                <div className="w-20 h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle className="w-10 h-10 text-emerald-500/40" />
                </div>
                <p className="text-sm font-bold uppercase tracking-widest text-slate-600">All Graded</p>
                <p className="text-xs mt-2 max-w-[180px] mx-auto text-slate-700 leading-relaxed">No student booklets are currently awaiting review.</p>
              </div>
            )}
          </div>
          
          <div className="mt-10 p-6 rounded-3xl bg-blue-600/10 border border-blue-500/10 group cursor-default">
             <div className="flex items-center gap-3 mb-2">
                <BrainCircuit className="w-5 h-5 text-blue-400" />
                <p className="text-xs font-black text-blue-400 uppercase tracking-widest">Grading Status</p>
             </div>
             <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">The grading engine is ready to evaluate submissions.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
