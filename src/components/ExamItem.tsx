import React from "react";
import { 
  BookOpen, 
  Users,
  Edit2,
  Trash2,
  FileText,
  CheckCircle,
  ExternalLink
} from "lucide-react";
import { motion } from "motion/react";
import { Exam } from "../types";

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
}) => {
  const openFile = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative h-full flex flex-col p-8 rounded-[40px] bg-slate-900/40 border border-slate-800/60 hover:border-blue-500/50 backdrop-blur-xl transition-all duration-500 overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none rotate-12">
         <BookOpen className="w-32 h-32" />
      </div>

      <div className="flex items-start justify-between mb-8 relative z-10">
        <div className="w-14 h-14 bg-blue-600/10 border border-blue-500/20 rounded-[22px] flex items-center justify-center text-blue-500 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-inner">
          <BookOpen className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 group-focus-within:translate-x-0">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); openFile(exam.questionPaperUrl); }} 
            className="p-3 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl border border-transparent hover:border-blue-500/20 transition-all cursor-pointer"
            title="View Question Paper"
          >
            <FileText className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); openFile(exam.markingSchemeUrl); }} 
            className="p-3 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl border border-transparent hover:border-emerald-500/20 transition-all cursor-pointer"
            title="View Marking Scheme"
          >
            <CheckCircle className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }} 
            className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-700 transition-all cursor-pointer"
            title="Edit Exam"
          >
            <Edit2 className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            className="p-3 text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
            title="Delete Exam"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    
    <div className="relative z-10 flex-1">
      <p className="text-[10px] font-mono font-black text-blue-500 uppercase tracking-[0.2em] mb-2">Exam Paper</p>
      <h3 className="text-2xl font-display font-black text-white italic tracking-tight mb-3 line-clamp-1 group-hover:text-blue-400 transition-colors">{exam.title}</h3>
      <div className="flex items-center gap-4 text-slate-500 font-mono text-[10px] uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-slate-600" />
          <span>{exam.studentList?.length || 0} Students</span>
        </div>
      </div>
    </div>

    <div className="mt-10 space-y-3 relative z-10">
      <button 
        onClick={onSelect}
        className="w-full py-4.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-[20px] hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/10 active:scale-[0.98] ring-1 ring-white/10"
      >
        View Submissions
      </button>
      <button 
        onClick={onManageStudents}
        className="w-full py-3.5 text-slate-500 hover:text-white hover:bg-slate-800 text-[10px] font-mono font-black uppercase tracking-widest rounded-xl transition-all border border-transparent hover:border-slate-700"
      >
        Manage Students
      </button>
    </div>
    
    <div className="absolute bottom-0 left-0 h-1 w-0 group-hover:w-full bg-blue-600/50 transition-all duration-700 delay-100" />
    </motion.div>
  );
});
