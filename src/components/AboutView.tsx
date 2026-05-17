import React from "react";
import { 
  GraduationCap, 
  ShieldCheck,
  BookMarked
} from "lucide-react";
import { motion } from "motion/react";

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
      <h1 className="text-6xl font-black text-white tracking-tighter">GradeMaster</h1>
      <p className="text-slate-400 text-xl font-medium max-w-2xl mx-auto">Advanced academic evaluation powered by AI.</p>
      <div className="flex items-center justify-center gap-4 text-emerald-400 font-bold bg-emerald-400/5 py-2.5 px-8 rounded-full w-max mx-auto border border-emerald-400/10 shadow-lg">
        <ShieldCheck className="w-4 h-4" />
        GradeMaster v1.0
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

      <section className="space-y-6 pt-6 border-t border-slate-800">
        <div className="flex items-center gap-3 text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
          <h3 className="text-xl font-bold uppercase tracking-widest text-white italic">Security</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
            <h4 className="text-emerald-400 font-bold mb-2">Private & Secure</h4>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your data is stored securely in the cloud. Only you have access to your exams and student submissions.
            </p>
          </div>
          <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
            <h4 className="text-blue-400 font-bold mb-2">Hybrid Performance</h4>
            <p className="text-slate-400 text-sm leading-relaxed">
              Guest Mode stores files on your device for instant speed. Gmail mode syncs to the cloud but offers <span className="text-white font-bold">Performance Caching</span> to match Guest Mode speed.
            </p>
          </div>
        </div>
      </section>
    </div>
  </motion.div>
));
