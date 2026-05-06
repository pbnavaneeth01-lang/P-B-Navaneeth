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
    whileHover={{ y: -5 }}
    className="p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] bg-slate-900 border border-slate-800 shadow-xl shadow-black/20"
  >
    <div className="flex items-center gap-4 sm:gap-6">
      <div className={cn("w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shrink-0", color)}>
        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 mb-1 truncate">{title}</p>
        <p className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate">{value}</p>
      </div>
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
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-3xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
          isDragActive ? "border-blue-500 bg-blue-500/5" : "border-slate-800 hover:border-slate-700 bg-slate-800/50",
          file && "border-blue-500/50 bg-blue-500/5"
        )}
      >
        <input {...getInputProps()} />
        <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center shadow-inner">
          <Upload className={cn("w-6 h-6", file ? "text-blue-400" : "text-slate-500")} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-white">
            {file ? file.name : "Click or drag to upload"}
          </p>
          <p className="text-xs text-slate-500 mt-1">PDF or Images (Max 10MB)</p>
        </div>
        {file && (
          <button 
            onClick={(e) => { e.stopPropagation(); onUpload(null); }}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
          >
            Remove File
          </button>
        )}
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
