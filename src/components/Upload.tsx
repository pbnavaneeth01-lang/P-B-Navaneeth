import React from "react";
import { motion } from "motion/react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText } from "lucide-react";
import { cn } from "../lib/utils";

interface MultiFileUploadProps {
  label: string;
  onUpload: (files: File[]) => void;
  files: File[];
}

export const MultiFileUpload = ({ label, onUpload, files }: MultiFileUploadProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onUpload(acceptedFiles),
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/zip': ['.zip']
    }
  });

  return (
    <div className="space-y-4">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-[48px] p-20 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 min-h-[350px]",
          isDragActive ? "border-blue-500 bg-blue-500/5" : "border-slate-800 hover:border-slate-700 bg-slate-900/50",
          files.length > 0 && "border-blue-500/50 bg-blue-500/5"
        )}
      >
        <input {...getInputProps()} />
        <div className="w-24 h-24 bg-slate-800 rounded-[32px] flex items-center justify-center mb-2 shadow-inner">
          <Upload className={cn("w-12 h-12", files.length > 0 ? "text-blue-400" : "text-slate-600")} />
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white mb-2">
            {files.length > 0 ? `${files.length} files selected` : "Bulk Upload Booklets"}
          </p>
          <p className="text-base text-slate-500 max-w-md mx-auto">
            Drag & drop multiple PDFs, Images, or a ZIP file. We'll automatically identify students by their filenames.
          </p>
        </div>
        
        {files.length > 0 && (
          <div className="w-full mt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-1 gap-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 border border-slate-700">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300 truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-slate-500">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface UploadProgressOverlayProps {
  progress: number;
  status: string;
}

export const UploadProgressOverlay = ({ progress, status }: UploadProgressOverlayProps) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-8"
  >
    <div className="w-full max-w-md space-y-8 text-center">
      <div className="relative w-32 h-32 mx-auto">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle 
            className="text-slate-800 stroke-current" 
            strokeWidth="8" 
            cx="50" cy="50" r="40" 
            fill="transparent" 
          />
          <motion.circle 
            className="text-blue-500 stroke-current" 
            strokeWidth="8" 
            strokeLinecap="round"
            cx="50" cy="50" r="40" 
            fill="transparent"
            initial={{ strokeDasharray: "0 251.2" }}
            animate={{ strokeDasharray: `${(progress / 100) * 251.2} 251.2` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{Math.round(progress)}%</span>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-white">{status}</h3>
        <p className="text-slate-400">Please wait while we process your files...</p>
      </div>
 
      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
        <motion.div 
          className="bg-blue-500 h-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  </motion.div>
);
