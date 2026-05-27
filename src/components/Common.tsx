import React from "react";
import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, CheckCircle, AlertCircle, Info, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { AnimatePresence } from "motion/react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}

export const StatCard = ({ title, value, icon: Icon, color }: StatCardProps) => (
  <motion.div 
    whileHover={{ y: -5, scale: 1.02 }}
    className="relative p-6 sm:p-8 rounded-[32px] bg-slate-900/40 border border-slate-800/60 shadow-2xl backdrop-blur-xl group overflow-hidden"
  >
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
      <Icon className="w-24 h-24 -mr-8 -mt-8" />
    </div>
    
    <div className="flex items-center gap-5 relative z-10">
      <div className={cn(
        "w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-lg shrink-0 transition-transform duration-500 group-hover:rotate-12", 
        color,
        "shadow-[0_0_20px_rgba(0,0,0,0.3)]"
      )}>
        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500 mb-1 truncate">{title}</p>
        <p className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate leading-none">{value}</p>
      </div>
    </div>
    
    <div className="mt-6 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className={cn("h-full opacity-30", color.replace('bg-', 'bg-'))} 
      />
    </div>
  </motion.div>
);

interface FileUploadProps {
  label: string;
  onUpload: (file: File | null) => void;
  file: File | null;
  accept?: any;
}

export const FileUpload = ({ label, onUpload, file, accept }: FileUploadProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onUpload(acceptedFiles[0]),
    accept,
    multiple: false
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <label className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500">{label}</label>
        {file && <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Linked</span>}
      </div>
      <div 
        {...getRootProps()} 
        className={cn(
          "relative group border-2 border-dashed rounded-[32px] p-10 transition-all duration-500 cursor-pointer overflow-hidden",
          isDragActive ? "border-blue-500 bg-blue-500/10 scale-[1.02]" : "border-slate-800 hover:border-slate-700 bg-slate-900/30",
          file ? "border-blue-500/40 bg-blue-500/5 shadow-inner" : "shadow-2xl"
        )}
      >
        <div className="absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
           <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full" />
        </div>

        <input {...getInputProps()} />
        <div className="relative z-10 flex flex-col items-center justify-center gap-6">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-2xl",
            file ? "bg-blue-600 text-white rotate-6" : "bg-slate-800 text-slate-500 group-hover:text-slate-300 group-hover:scale-110"
          )}>
            <Upload className="w-8 h-8" />
          </div>
          <div className="text-center">
            <p className={cn(
              "text-base font-bold transition-colors",
              file ? "text-blue-400" : "text-slate-200 group-hover:text-white"
            )}>
              {file ? file.name : "Select File"}
            </p>
            <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mt-2">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB • READY` : "Max capacity 10MB"}
            </p>
          </div>
          {file && (
            <button 
              onClick={(e) => { e.stopPropagation(); onUpload(null); }}
              className="px-6 py-2 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-lg shadow-rose-900/20"
            >
              Remove File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ToastProps {
  message: string;
  type: "success" | "error" | "info" | "loading";
  onClose?: () => void;
}

export const Toast = ({ message, type, onClose }: ToastProps) => {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
    loading: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
  };

  const colors = {
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-100",
    error: "bg-red-500/10 border-red-500/20 text-red-100",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-100",
    loading: "bg-slate-900 border-slate-700 text-white"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] px-6 py-4 rounded-2xl border shadow-2xl flex items-center gap-3 backdrop-blur-md min-w-[300px] max-w-[90vw]",
        colors[type]
      )}
    >
      <div className="shrink-0">{icons[type]}</div>
      <p className="text-sm font-bold flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/50" />
        </button>
      )}
    </motion.div>
  );
};

export const Skeleton = ({ className, repeat = 1 }: { className?: string; repeat?: number }) => (
  <>
    {Array.from({ length: repeat }).map((_, i) => (
      <div 
        key={i} 
        className={cn("animate-pulse bg-slate-800/50 rounded-2xl", className)} 
      />
    ))}
  </>
);
