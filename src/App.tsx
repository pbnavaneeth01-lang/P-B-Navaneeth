import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  CheckCircle, 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Plus, 
  ChevronRight, 
  ArrowLeft,
  LogOut,
  LogIn,
  Menu,
  X,
  Loader2,
  AlertCircle,
  FileCheck,
  GraduationCap,
  BrainCircuit,
  Sparkles,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDropzone } from "react-dropzone";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from "jszip";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import { auth, db, signInWithGoogle, logout, createExam, updateExam, deleteExam, createSubmission, updateSubmission, deleteSubmission, handleFirestoreError, OperationType } from "./firebase";
import { cn, fileToBase64 } from "./lib/utils";
import { evaluateExam, extractStudentDetails } from "./lib/gemini";
import { Exam, Submission, AppFeature, EvaluationQuestion } from "./types";

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any; 
  label: string; 
  active: boolean; 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-left group",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", active && "text-white")} />
    <span className="font-medium">{label}</span>
    {active && (
      <motion.div 
        layoutId="active-pill" 
        className="ml-auto w-1.5 h-1.5 rounded-full bg-white" 
      />
    )}
  </button>
);

const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) => (
  <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex items-center gap-6">
    <div className={cn("p-4 rounded-2xl", color)}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
    </div>
  </div>
);

const FileUpload = ({ label, onUpload, file, accept }: { label: string; onUpload: (file: File) => void; file: File | null; accept?: any }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => acceptedFiles[0] && onUpload(acceptedFiles[0]),
    accept,
    multiple: false
  });

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 min-h-[200px]",
          isDragActive ? "border-blue-500 bg-blue-500/5" : "border-slate-800 hover:border-slate-700 bg-slate-900/50",
          file && "border-green-500/50 bg-green-500/5"
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <>
            <FileCheck className="w-12 h-12 text-green-400" />
            <span className="text-base font-medium text-green-400 truncate max-w-full px-4">{file.name}</span>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-slate-600" />
            <span className="text-base font-medium text-slate-400">Drag & drop or click to upload</span>
          </>
        )}
      </div>
    </div>
  );
};

const MultiFileUpload = ({ label, onUpload, files, accept }: { label: string; onUpload: (files: File[]) => void; files: File[]; accept?: any }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onUpload(acceptedFiles),
    accept,
    multiple: true
  });

  return (
    <div className="space-y-2">
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

const BookletAnnotator = ({ bookletUrl, questions }: { bookletUrl: string; questions: EvaluationQuestion[] }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBooklet = async () => {
      setLoading(true);
      try {
        if (bookletUrl.startsWith('data:application/pdf')) {
          const loadingTask = pdfjsLib.getDocument(bookletUrl);
          const pdf = await loadingTask.promise;
          const pageImages: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context!, viewport, canvas: canvas as any }).promise;
            pageImages.push(canvas.toDataURL());
          }
          setPages(pageImages);
        } else {
          setPages([bookletUrl]);
        }
      } catch (err) {
        console.error("Error loading booklet for annotation:", err);
      } finally {
        setLoading(false);
      }
    };
    loadBooklet();
  }, [bookletUrl]);

  if (loading) return <div className="flex items-center justify-center p-10"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-8 mt-10 pt-10 border-t border-slate-800">
      <h3 className="text-xl font-bold text-white">Annotated Booklet</h3>
      <div className="space-y-6">
        {pages.map((pageImg, idx) => (
          <div key={idx} className="relative border border-slate-800 rounded-3xl overflow-hidden bg-white shadow-2xl">
            <img src={pageImg} alt={`Page ${idx + 1}`} className="w-full h-auto" referrerPolicy="no-referrer" />
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
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFeature, setActiveFeature] = useState<AppFeature>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Data States
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  // Form States
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState("");
  const [newExamQP, setNewExamQP] = useState<File | null>(null);
  const [newExamMS, setNewExamMS] = useState<File | null>(null);

  const [isAddingSubmission, setIsAddingSubmission] = useState(false);
  const [isBulkAddingSubmissions, setIsBulkAddingSubmissions] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [newBooklet, setNewBooklet] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [useAIForBulkNames, setUseAIForBulkNames] = useState(true);

  const [newExamStudentList, setNewExamStudentList] = useState("");
  const [isManagingStudents, setIsManagingStudents] = useState<string | null>(null); // examId

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "exams"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExams(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
    }, (err) => {
      console.error("Exams Snapshot Error:", err);
      setError("Failed to sync exams. Please check your connection.");
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    }, (err) => {
      console.error("Submissions Snapshot Error:", err);
      setError("Failed to sync submissions. Please check your connection.");
    });
    return unsubscribe;
  }, [user]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleCreateExam started");
    if (!user) return;
    
    if (!newExamTitle || !newExamQP || !newExamMS) {
      alert("Please provide a title, question paper, and marking scheme.");
      return;
    }

    // Firestore 1MB limit check (Base64 adds ~33% overhead)
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
    if (newExamQP.size > MAX_FILE_SIZE || newExamMS.size > MAX_FILE_SIZE) {
      alert(`Files are too large. Each file must be under 1MB. \n\nQP: ${(newExamQP.size / 1024).toFixed(1)}KB\nMS: ${(newExamMS.size / 1024).toFixed(1)}KB\n\nTip: If the total document size exceeds 1MB, Firestore may reject it.`);
      return;
    }

    setLoading(true);
    try {
      console.log("Converting files to Base64...");
      const qp = await fileToBase64(newExamQP);
      const ms = await fileToBase64(newExamMS);
      
      console.log("Saving exam to Firestore...", {
        title: newExamTitle,
        qpSize: qp.data.length,
        msSize: ms.data.length
      });
      
      const result = await createExam({
        uid: user.uid,
        title: newExamTitle,
        questionPaperUrl: `data:${qp.mimeType};base64,${qp.data}`,
        markingSchemeUrl: `data:${ms.mimeType};base64,${ms.data}`,
        studentList: newExamStudentList.split('\n').map(s => s.trim()).filter(s => s !== ""),
        createdAt: new Date().toISOString()
      });
      
      console.log("Exam created successfully with ID:", result?.id);
      setIsCreatingExam(false);
      setNewExamTitle("");
      setNewExamQP(null);
      setNewExamMS(null);
      setNewExamStudentList("");
    } catch (error: any) {
      console.error("Create Exam Error:", error);
      let message = "Failed to create exam.";
      try {
        const errData = JSON.parse(error.message);
        message = `Error: ${errData.error}`;
      } catch (e) {
        message = error.message || message;
      }
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (newBooklet && !newStudentName && !isScanning) {
      handleScanDetails(newBooklet);
    }
  }, [newBooklet]);

  const handleScanDetails = async (file: File) => {
    if (!file) return;
    setIsScanning(true);
    try {
      const booklet = await fileToBase64(file);
      const details = await extractStudentDetails(booklet);
      if (details.studentName) {
        setNewStudentName(details.studentName);
      }
    } catch (err) {
      console.error("Scan Details Error:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let studentName = newStudentName;
    
    if (!selectedExamId || !newBooklet) {
      alert("Please provide a booklet.");
      return;
    }

    setLoading(true);
    try {
      const booklet = await fileToBase64(newBooklet);
      
      // If student name is still empty, try to extract it one last time
      if (!studentName) {
        const details = await extractStudentDetails(booklet);
        studentName = details.studentName;
      }

      if (!studentName) {
        alert("Could not identify student name. Please enter it manually.");
        setLoading(false);
        return;
      }

      // Firestore 1MB limit check
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB for submission booklet
      if (newBooklet.size > MAX_FILE_SIZE) {
        alert(`Booklet file is too large. It must be under 1MB. \n\nCurrent size: ${(newBooklet.size / 1024).toFixed(1)}KB`);
        setLoading(false);
        return;
      }

      await createSubmission({
        uid: user!.uid,
        examId: selectedExamId,
        studentName: studentName,
        bookletUrl: `data:${booklet.mimeType};base64,${booklet.data}`,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      setIsAddingSubmission(false);
      setNewStudentName("");
      setNewBooklet(null);
    } catch (error: any) {
      console.error("Add Submission Error:", error);
      let message = "Failed to add submission.";
      try {
        const errData = JSON.parse(error.message);
        message = `Error: ${errData.error}`;
      } catch (e) {
        message = error.message || message;
      }
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedExamId || bulkFiles.length === 0) return;

    setLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const processFile = async (file: File) => {
        try {
          // If it's a zip file, extract and process contents
          if (file.name.toLowerCase().endsWith('.zip')) {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            const files = Object.values(contents.files).filter(f => !f.dir);
            
            for (const zipEntry of files) {
              const blob = await zipEntry.async("blob");
              const extractedFile = new File([blob], zipEntry.name, { type: blob.type || "application/octet-stream" });
              
              // Only process supported types (PDF, Images)
              const isSupported = extractedFile.name.match(/\.(pdf|png|jpg|jpeg)$/i);
              if (isSupported) {
                await uploadSingleFile(extractedFile);
              }
            }
          } else {
            await uploadSingleFile(file);
          }
        } catch (err) {
          console.error(`Error processing ${file.name}:`, err);
          failCount++;
        }
      };

      const uploadSingleFile = async (file: File) => {
        // Check file size for bulk upload too
        const MAX_FILE_SIZE = 1024 * 1024; 
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`Skipping ${file.name}: File is too large (${(file.size / 1024).toFixed(1)}KB). Max 1MB.`);
          failCount++;
          return;
        }

        const booklet = await fileToBase64(file);
        
        let studentName = "";
        if (useAIForBulkNames) {
          try {
            const details = await extractStudentDetails(booklet);
            studentName = details.studentName;
          } catch (err) {
            console.warn(`AI extraction failed for ${file.name}, falling back to filename.`);
          }
        }
        
        // Fallback to filename if AI fails or is disabled
        if (!studentName) {
          studentName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").replace(/-/g, " ");
        }
        
        await createSubmission({
          uid: user.uid,
          examId: selectedExamId,
          studentName,
          bookletUrl: `data:${booklet.mimeType};base64,${booklet.data}`,
          status: "pending",
          createdAt: new Date().toISOString()
        });
        successCount++;
      };

      for (const file of bulkFiles) {
        await processFile(file);
      }

      alert(`Bulk upload complete! ${successCount} submissions added. ${failCount > 0 ? `${failCount} failed.` : ""}`);
      setIsBulkAddingSubmissions(false);
      setBulkFiles([]);
    } catch (error: any) {
      console.error("Bulk Upload Error:", error);
      alert("An error occurred during bulk upload.");
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async (submission: Submission) => {
    const exam = exams.find(e => e.id === submission.examId);
    if (!exam) return;

    setIsEvaluating(true);
    try {
      const extractData = (url: string) => {
        const parts = url.split(",");
        if (parts.length < 2) throw new Error("Invalid document format.");
        const mimePart = url.split(":")[1]?.split(";")[0];
        if (!mimePart) throw new Error("Could not determine document type.");
        return { data: parts[1], mimeType: mimePart };
      };

      const qp = extractData(exam.questionPaperUrl);
      const ms = extractData(exam.markingSchemeUrl);
      const booklet = extractData(submission.bookletUrl);

      const result = await evaluateExam(qp, ms, booklet);
      
      await updateSubmission(submission.id!, {
        status: "evaluated",
        totalMarks: result.totalMarks,
        maxMarks: result.maxMarks,
        evaluationData: { questions: result.questions }
      });
      
      setEvaluationResult(result);
    } catch (error: any) {
      console.error("Evaluation Error:", error);
      
      let feedback = "Evaluation failed. ";
      
      if (error.message?.includes("Invalid document format") || error.message?.includes("Could not determine document type")) {
        feedback += "One of the uploaded documents seems to be corrupted or in an unsupported format.";
      } else if (error.message?.includes("safety")) {
        feedback += "The AI could not process the documents due to safety filters. Please ensure they contain only educational content.";
      } else if (error.message?.includes("quota") || error.message?.includes("limit")) {
        feedback += "The AI service is currently busy or quota has been reached. Please try again in a few minutes.";
      } else if (error instanceof SyntaxError) {
        feedback += "The AI returned an unreadable response. This often happens if the handwriting is too difficult to read or the scan quality is low.";
      } else {
        feedback += "\n\nSuggested checks:\n" +
          "• Ensure all pages are clearly visible and well-lit.\n" +
          "• Check if the student booklet matches the question paper.\n" +
          "• Verify that the marking scheme is complete.\n" +
          "• Try re-uploading the documents if the problem persists.";
      }
      
      alert(feedback);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam || !editingExam.id) return;
    
    setLoading(true);
    try {
      await updateExam(editingExam.id, {
        title: editingExam.title,
        studentList: editingExam.studentList
      });
      setEditingExam(null);
    } catch (error: any) {
      console.error("Update Exam Error:", error);
      alert("Failed to update exam.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm("Are you sure you want to delete this exam? This will also delete all associated submissions.")) return;
    
    setLoading(true);
    try {
      // Delete associated submissions first
      const associatedSubmissions = submissions.filter(s => s.examId === id);
      for (const sub of associatedSubmissions) {
        if (sub.id) await deleteSubmission(sub.id);
      }
      
      await deleteExam(id);
      if (selectedExamId === id) setSelectedExamId(null);
    } catch (error: any) {
      console.error("Delete Exam Error:", error);
      alert("Failed to delete exam.");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!reportRef.current) return;
    
    // Show a loading state or toast if possible
    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#020617", // Match slate-950
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeightInPdf = (imgProps.height * pdfWidth) / imgProps.width;
    
    let heightLeft = imgHeightInPdf;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightInPdf);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeightInPdf;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightInPdf);
      heightLeft -= pdfHeight;
    }
    
    pdf.save(`Evaluation_${selectedSubmissionId}.pdf`);
  };

  const exportGradesCSV = (examId?: string) => {
    const targetExamId = examId || selectedExamId;
    const currentExam = exams.find(e => e.id === targetExamId);
    if (!currentExam) return;

    const evaluatedSubmissions = submissions.filter(s => s.examId === targetExamId && s.status === "evaluated");
    if (evaluatedSubmissions.length === 0) {
      alert("No evaluated submissions to export.");
      return;
    }

    // Header: Student Name, Total Marks, Max Marks, Question 1, Question 2, ...
    const maxQuestions = Math.max(...evaluatedSubmissions.map(s => s.evaluationData?.questions.length || 0));
    const questionHeaders = Array.from({ length: maxQuestions }, (_, i) => `Q${i + 1}`).join(",");
    const csvRows = [
      `Student Name,Total Marks,Max Marks,${questionHeaders}`
    ];

    evaluatedSubmissions.forEach(sub => {
      const questionMarks = sub.evaluationData?.questions.map(q => q.marksAwarded).join(",") || "";
      csvRows.push(`"${sub.studentName}",${sub.totalMarks},${sub.maxMarks},${questionMarks}`);
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Grades_${currentExam.title.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <GraduationCap className="w-10 h-10 text-blue-500" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">GradeMaster AI</h1>
          <p className="text-slate-400 mb-10 text-lg leading-relaxed">AI-powered exam evaluation and grading system for educators.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full py-4 px-6 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-xl shadow-white/10"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const sortedExams = [...exams].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sortedSubmissions = [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const filteredSubmissions = sortedSubmissions.filter(s => s.examId === selectedExamId);
  const currentSubmission = submissions.find(s => s.id === selectedSubmissionId);

  return (
    <div className="h-screen w-full flex bg-slate-950 overflow-hidden font-sans text-slate-200">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-50"
          >
            <div className="p-8 flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">GradeMaster</h1>
            </div>

            <nav className="flex-1 px-4 space-y-2">
              <SidebarItem 
                icon={LayoutDashboard} 
                label="Dashboard" 
                active={activeFeature === "dashboard"} 
                onClick={() => { setActiveFeature("dashboard"); setSelectedExamId(null); setSelectedSubmissionId(null); }} 
              />
              <SidebarItem 
                icon={BookOpen} 
                label="My Exams" 
                active={activeFeature === "exams"} 
                onClick={() => { setActiveFeature("exams"); setSelectedExamId(null); setSelectedSubmissionId(null); }} 
              />
              <SidebarItem 
                icon={Users} 
                label="Submissions" 
                active={activeFeature === "submissions"} 
                onClick={() => { setActiveFeature("submissions"); }} 
              />
              <SidebarItem 
                icon={GraduationCap} 
                label="Students" 
                active={activeFeature === "students"} 
                onClick={() => { setActiveFeature("students"); setSelectedExamId(null); setSelectedSubmissionId(null); }} 
              />
            </nav>

            <div className="p-6 border-t border-slate-800">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/50 mb-4">
                <img src={user.photoURL || ""} alt="" className="w-10 h-10 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-white">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="w-full py-3 px-4 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all flex items-center gap-3"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 h-full flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-slate-800 flex items-center px-8 gap-4 bg-slate-950/80 backdrop-blur-xl z-40">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="h-6 w-px bg-slate-800 mx-2" />
          <div className="flex-1 flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-500 capitalize">{activeFeature}</span>
            {selectedExamId && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-white">{exams.find(e => e.id === selectedExamId)?.title}</span>
              </>
            )}
            {selectedSubmissionId && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-white">{submissions.find(s => s.id === selectedSubmissionId)?.studentName}</span>
              </>
            )}
          </div>
          {error && (
            <div className="mx-4 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs font-bold animate-pulse">
              <AlertCircle className="w-4 h-4" />
              {error}
              <button onClick={() => setError(null)} className="ml-2 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </header>

        {/* Views */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-12">
          <AnimatePresence mode="wait">
            {activeFeature === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div>
                  <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Dashboard Overview</h1>
                  <p className="text-slate-400 text-lg">Manage your exams and student evaluations.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard title="Total Exams" value={exams.length} icon={BookOpen} color="bg-blue-600" />
                  <StatCard title="Submissions" value={submissions.length} icon={Users} color="bg-purple-600" />
                  <StatCard title="Evaluated" value={submissions.filter(s => s.status === "evaluated").length} icon={CheckCircle} color="bg-green-600" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-8 rounded-[32px] bg-slate-900 border border-slate-800">
                    <h2 className="text-xl font-bold text-white mb-6">Recent Exams</h2>
                    <div className="space-y-4">
                      {exams.slice(0, 3).map(exam => (
                        <button 
                          key={exam.id}
                          onClick={() => { setSelectedExamId(exam.id!); setActiveFeature("submissions"); }}
                          className="w-full p-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center">
                              <FileText className="w-5 h-5 text-slate-300" />
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-white">{exam.title}</p>
                              <p className="text-xs text-slate-500">{new Date(exam.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
                        </button>
                      ))}
                      {exams.length === 0 && <p className="text-slate-500 text-center py-4">No exams created yet.</p>}
                    </div>
                  </div>

                  <div className="p-8 rounded-[32px] bg-slate-900 border border-slate-800">
                    <h2 className="text-xl font-bold text-white mb-6">Pending Evaluations</h2>
                    <div className="space-y-4">
                      {submissions.filter(s => s.status === "pending").slice(0, 3).map(sub => (
                        <div key={sub.id} className="p-4 rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                              <p className="font-bold text-white">{sub.studentName}</p>
                              <p className="text-xs text-slate-500">{exams.find(e => e.id === sub.examId)?.title}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => { setSelectedExamId(sub.examId); setSelectedSubmissionId(sub.id!); setActiveFeature("evaluate"); }}
                            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-colors"
                          >
                            Evaluate
                          </button>
                        </div>
                      ))}
                      {submissions.filter(s => s.status === "pending").length === 0 && <p className="text-slate-500 text-center py-4">All caught up!</p>}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeFeature === "exams" && (
              <motion.div
                key="exams"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Exams</h1>
                    <p className="text-slate-500">Create and manage your examination papers.</p>
                  </div>
                  <button 
                    onClick={() => setIsCreatingExam(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                  >
                    <Plus className="w-5 h-5" />
                    New Exam
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedExams.map(exam => (
                    <div key={exam.id} className="p-6 rounded-[32px] bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all group relative">
                      <div className="flex items-start justify-between mb-6">
                        <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center">
                          <BookOpen className="w-6 h-6 text-blue-500" />
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setEditingExam(exam)}
                            className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteExam(exam.id!)}
                            className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{exam.title}</h3>
                      <p className="text-sm text-slate-500 mb-6">Created on {new Date(exam.createdAt).toLocaleDateString()}</p>
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                          <button 
                            onClick={() => { setSelectedExamId(exam.id!); setActiveFeature("submissions"); }}
                            className="flex-1 py-3 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
                          >
                            Submissions
                          </button>
                          <button 
                            onClick={() => { setSelectedExamId(exam.id!); setActiveFeature("submissions"); setIsAddingSubmission(true); }}
                            className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {submissions.some(s => s.examId === exam.id && s.status === "evaluated") && (
                          <button 
                            onClick={() => exportGradesCSV(exam.id)}
                            className="w-full py-3 bg-slate-800/50 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-2 border border-slate-800"
                          >
                            <Download className="w-4 h-4" />
                            Export Grades (CSV)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isCreatingExam && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[40px] p-10 max-w-2xl w-full shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Create New Exam</h2>
                        <button onClick={() => setIsCreatingExam(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      <form onSubmit={handleCreateExam} className="space-y-8">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Exam Title</label>
                          <input 
                            required
                            value={newExamTitle}
                            onChange={(e) => setNewExamTitle(e.target.value)}
                            placeholder="e.g. Mathematics Final 2024"
                            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FileUpload 
                            label="Question Paper (PDF/Image)" 
                            onUpload={setNewExamQP} 
                            file={newExamQP} 
                            accept={{ 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }}
                          />
                          <FileUpload 
                            label="Marking Scheme (PDF/Image)" 
                            onUpload={setNewExamMS} 
                            file={newExamMS} 
                            accept={{ 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Student Roster (Optional - One per line)</label>
                          <textarea 
                            rows={4}
                            value={newExamStudentList}
                            onChange={(e) => setNewExamStudentList(e.target.value)}
                            placeholder="John Doe&#10;Jane Smith&#10;..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Create Exam"}
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}

                {editingExam && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[40px] p-10 max-w-xl w-full shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Edit Exam</h2>
                        <button onClick={() => setEditingExam(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      <form onSubmit={handleUpdateExam} className="space-y-8">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Exam Title</label>
                          <input 
                            required
                            value={editingExam.title}
                            onChange={(e) => setEditingExam({ ...editingExam, title: e.target.value })}
                            placeholder="e.g. Mathematics Final 2024"
                            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Save Changes"}
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}

            {activeFeature === "submissions" && (
              <motion.div
                key="submissions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setActiveFeature("exams")} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                      <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-1">Submissions</h1>
                      <p className="text-slate-500">Student booklets for {exams.find(e => e.id === selectedExamId)?.title}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => exportGradesCSV()}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <Download className="w-5 h-5" />
                      Export Grades (CSV)
                    </button>
                    <button 
                      onClick={() => setIsBulkAddingSubmissions(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <Upload className="w-5 h-5" />
                      Bulk Upload
                    </button>
                    <button 
                      onClick={() => setIsAddingSubmission(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                    >
                      <Plus className="w-5 h-5" />
                      Add Submission
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[32px] overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/30">
                        <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Student Name</th>
                        <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Status</th>
                        <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Marks</th>
                        <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Date</th>
                        <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredSubmissions.map(sub => (
                        <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-8 py-5 font-bold text-white">{sub.studentName}</td>
                          <td className="px-8 py-5">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              sub.status === "evaluated" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"
                            )}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-sm font-medium text-slate-300">
                            {sub.status === "evaluated" ? `${sub.totalMarks} / ${sub.maxMarks}` : "-"}
                          </td>
                          <td className="px-8 py-5 text-sm text-slate-500">{new Date(sub.createdAt).toLocaleDateString()}</td>
                          <td className="px-8 py-5 text-right space-x-2">
                            <button 
                              onClick={() => { setSelectedSubmissionId(sub.id!); setActiveFeature("evaluate"); }}
                              className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors"
                            >
                              {sub.status === "evaluated" ? "View Result" : "Evaluate"}
                            </button>
                            <button 
                              onClick={() => deleteSubmission(sub.id!)}
                              className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredSubmissions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-20 text-center text-slate-500">
                            No submissions found for this exam.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {isAddingSubmission && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[40px] p-10 max-w-xl w-full shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Add Student Submission</h2>
                        <button onClick={() => setIsAddingSubmission(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      <form onSubmit={handleAddSubmission} className="space-y-8">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Student Name</label>
                            {isScanning && (
                              <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                AI Scanning...
                              </div>
                            )}
                          </div>
                          {exams.find(e => e.id === selectedExamId)?.studentList?.length ? (
                            <div className="space-y-2">
                              <select
                                value={newStudentName === "" ? "" : (exams.find(e => e.id === selectedExamId)?.studentList?.includes(newStudentName) ? newStudentName : "custom")}
                                onChange={(e) => {
                                  if (e.target.value === "custom") {
                                    setNewStudentName(" "); // trigger custom input
                                  } else {
                                    setNewStudentName(e.target.value);
                                  }
                                }}
                                className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all appearance-none"
                              >
                                <option value="">Select Student (Optional - AI will auto-scan)</option>
                                {exams.find(e => e.id === selectedExamId)?.studentList?.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                                <option value="custom">-- Other (Type Name) --</option>
                              </select>
                              {(newStudentName === " " || (newStudentName !== "" && !exams.find(e => e.id === selectedExamId)?.studentList?.includes(newStudentName))) && (
                                <input 
                                  autoFocus
                                  value={newStudentName === " " ? "" : newStudentName}
                                  placeholder="Enter student name manually"
                                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                                  onChange={(e) => setNewStudentName(e.target.value)}
                                />
                              )}
                            </div>
                          ) : (
                            <input 
                              value={newStudentName}
                              onChange={(e) => setNewStudentName(e.target.value)}
                              placeholder="Optional - AI will scan booklet for name"
                              className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                            />
                          )}
                        </div>
                        <FileUpload 
                          label="Handwritten Booklet (PDF/Images)" 
                          onUpload={setNewBooklet} 
                          file={newBooklet} 
                          accept={{ 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }}
                        />
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Add Submission"}
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}

                {isBulkAddingSubmissions && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[40px] p-10 max-w-2xl w-full shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Bulk Upload Booklets</h2>
                        <button onClick={() => setIsBulkAddingSubmissions(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      <form onSubmit={handleBulkUpload} className="space-y-8">
                        <MultiFileUpload 
                          label="Select Files" 
                          onUpload={setBulkFiles} 
                          files={bulkFiles} 
                          accept={{ 
                            'application/pdf': ['.pdf'], 
                            'image/*': ['.png', '.jpg', '.jpeg'],
                            'application/zip': ['.zip']
                          }}
                        />
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-800 border border-slate-700">
                          <input 
                            type="checkbox" 
                            id="useAI"
                            checked={useAIForBulkNames}
                            onChange={(e) => setUseAIForBulkNames(e.target.checked)}
                            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                          />
                          <label htmlFor="useAI" className="text-sm text-slate-300 cursor-pointer select-none">
                            Use AI to identify student names from booklet content (slower but more accurate)
                          </label>
                        </div>
                        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                          <p className="text-xs text-blue-400 leading-relaxed">
                            <strong>Tip:</strong> {useAIForBulkNames ? "AI will scan the first page of each document for student details." : "Filenames will be used as student names. You can upload multiple PDFs/Images directly or a single ZIP file containing them."}
                          </p>
                        </div>
                        <button 
                          type="submit"
                          disabled={loading || bulkFiles.length === 0}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Start Bulk Upload"}
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}

            {activeFeature === "students" && (
              <motion.div
                key="students"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Student Lists</h1>
                    <p className="text-slate-500">Manage student rosters for each exam to track submissions.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedExams.map(exam => {
                    const examSubmissions = submissions.filter(s => s.examId === exam.id);
                    const submittedCount = examSubmissions.length;
                    const totalStudents = exam.studentList?.length || 0;
                    
                    return (
                      <div key={exam.id} className="p-6 rounded-[32px] bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all group relative">
                        <div className="flex items-start justify-between mb-6">
                          <div className="w-12 h-12 bg-purple-600/20 rounded-2xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-purple-500" />
                          </div>
                          <button 
                            onClick={() => {
                              setIsManagingStudents(exam.id!);
                              setNewExamStudentList(exam.studentList?.join('\n') || "");
                            }}
                            className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{exam.title}</h3>
                        <div className="flex items-center gap-4 mb-6">
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 transition-all duration-500" 
                              style={{ width: `${totalStudents > 0 ? (submittedCount / totalStudents) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-400">{submittedCount}/{totalStudents}</span>
                        </div>
                        
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                          {exam.studentList?.map((student, idx) => {
                            const hasSubmitted = examSubmissions.some(s => s.studentName.toLowerCase() === student.toLowerCase());
                            return (
                              <div key={idx} className="flex items-center justify-between text-sm p-2 rounded-lg bg-slate-800/30">
                                <span className={cn("font-medium", hasSubmitted ? "text-white" : "text-slate-500")}>{student}</span>
                                {hasSubmitted ? (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border border-slate-700" />
                                )}
                              </div>
                            );
                          })}
                          {(!exam.studentList || exam.studentList.length === 0) && (
                            <p className="text-xs text-slate-600 italic">No students added yet.</p>
                          )}
                        </div>

                        <button 
                          onClick={() => {
                            setIsManagingStudents(exam.id!);
                            setNewExamStudentList(exam.studentList?.join('\n') || "");
                          }}
                          className="w-full mt-6 py-3 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
                        >
                          Manage Roster
                        </button>
                      </div>
                    );
                  })}
                </div>

                {isManagingStudents && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[40px] p-10 max-w-2xl w-full shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-2xl font-bold text-white">Manage Roster</h2>
                          <p className="text-slate-500 text-sm">{exams.find(e => e.id === isManagingStudents)?.title}</p>
                        </div>
                        <button onClick={() => setIsManagingStudents(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Student Names (One per line)</label>
                          <textarea 
                            rows={10}
                            value={newExamStudentList}
                            onChange={(e) => setNewExamStudentList(e.target.value)}
                            placeholder="John Doe&#10;Jane Smith&#10;..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                          />
                        </div>
                        
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setIsManagingStudents(null)}
                            className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={async () => {
                              const list = newExamStudentList.split('\n').map(s => s.trim()).filter(s => s !== "");
                              setLoading(true);
                              try {
                                await updateExam(isManagingStudents, { studentList: list });
                                setIsManagingStudents(null);
                                setNewExamStudentList("");
                              } catch (e) {
                                alert("Failed to update student list");
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all"
                          >
                            Save Roster
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}

            {activeFeature === "evaluate" && currentSubmission && (
              <motion.div
                key="evaluate"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setActiveFeature("submissions")} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                      <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-1">Evaluation</h1>
                      <p className="text-slate-500">Evaluating {currentSubmission.studentName}'s booklet</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {currentSubmission.status === "evaluated" && (
                      <button 
                        onClick={exportPDF}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all"
                      >
                        <Download className="w-5 h-5" />
                        Export PDF
                      </button>
                    )}
                    <button 
                      onClick={() => handleEvaluate(currentSubmission)}
                      disabled={isEvaluating}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all disabled:opacity-50"
                    >
                      {isEvaluating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      {currentSubmission.status === "evaluated" ? "Re-evaluate" : "Start Evaluation"}
                    </button>
                  </div>
                </div>

                {isEvaluating ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                      <div className="w-24 h-24 bg-blue-600/20 rounded-full animate-ping absolute inset-0" />
                      <div className="w-24 h-24 bg-blue-600/40 rounded-full flex items-center justify-center relative">
                        <BrainCircuit className="w-10 h-10 text-blue-400 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-2">AI is analyzing the booklet...</h2>
                      <p className="text-slate-500 max-w-sm mx-auto">This may take a minute. We are transcribing handwriting and comparing with marking scheme.</p>
                    </div>
                  </div>
                ) : currentSubmission.status === "evaluated" ? (
                  <div ref={reportRef} className="space-y-10 bg-slate-900 border border-slate-800 rounded-[40px] p-10">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-10">
                      <div>
                        <h2 className="text-3xl font-bold text-white mb-2">{currentSubmission.studentName}</h2>
                        <p className="text-slate-500">Exam: {exams.find(e => e.id === currentSubmission.examId)?.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-1">Total Score</p>
                        <p className="text-5xl font-black text-blue-500">{currentSubmission.totalMarks} <span className="text-2xl text-slate-700">/ {currentSubmission.maxMarks}</span></p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-xl font-bold text-white">Question-wise Breakdown</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {currentSubmission.evaluationData?.questions.map((q: EvaluationQuestion, i: number) => (
                          <div key={i} className="p-6 rounded-3xl bg-slate-800/50 border border-slate-800 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center justify-center">Q{q.questionNumber}</span>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Page {q.pageNumber}</span>
                              </div>
                              <div className="px-4 py-1.5 bg-slate-900 rounded-full text-sm font-bold text-blue-400 border border-slate-700">
                                {q.marksAwarded} / {q.maxMarks} Marks
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Transcription</p>
                                <p className="text-sm text-slate-300 italic leading-relaxed">"{q.transcription}"</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">AI Feedback</p>
                                <p className="text-sm text-slate-400 leading-relaxed">{q.feedback}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <BookletAnnotator 
                      bookletUrl={currentSubmission.bookletUrl} 
                      questions={currentSubmission.evaluationData?.questions || []} 
                    />
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center p-10 bg-slate-900/50 border border-slate-800 border-dashed rounded-[40px]">
                    <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
                      <AlertCircle className="w-10 h-10 text-slate-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Ready for Evaluation</h2>
                    <p className="text-slate-500 max-w-sm mx-auto mb-8">Click the button above to start the AI evaluation process for this student's submission.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
