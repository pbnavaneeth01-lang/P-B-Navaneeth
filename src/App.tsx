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
  Edit2,
  Info,
  ShieldCheck,
  Cpu,
  BookMarked,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDropzone } from "react-dropzone";
import { 
  evaluateExam, 
  extractStudentDetails, 
} from "./lib/gemini";

// PDF.js will be loaded dynamically to save initial load time
let pdfjsLib: any = null;
const loadPdfjs = async () => {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  return pdfjsLib;
};

import { StatCard, FileUpload, Toast } from "./components/Common";
import { MultiFileUpload, UploadProgressOverlay } from "./components/Upload";
import { 
  DashboardView, 
  ExamItem, 
  SubmissionsView, 
  AboutView,
  SettingsView
} from "./components/Views";

const BookletAnnotator = React.lazy(() => import("./components/Evaluation").then(m => ({ default: m.BookletAnnotator })));

import { auth, db, storage, signInWithGoogle, logout, createExam, updateExam, deleteExam, createSubmission, updateSubmission, deleteSubmission, handleFirestoreError, OperationType, testConnection, signUpWithEmail, loginWithEmail, resetPassword } from "./firebase";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import imageCompression from 'browser-image-compression';
import { cn, fileToBase64, fixHtml2CanvasOklch } from "./lib/utils";
import { Exam, Submission, AppFeature, EvaluationQuestion } from "./types";

// --- Utils ---

const validateFile = (file: File, allowedTypes: string[]): string | null => {
  if (!file) return "No file selected.";
  
  const isAllowed = allowedTypes.some(type => {
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.replace('/*', ''));
    }
    // Check extension as fallback for some browsers/files
    const ext = "." + file.name.split('.').pop()?.toLowerCase();
    return file.type === type || ext === type.toLowerCase();
  });

  if (!isAllowed) {
    return `Unsupported file type: ${file.name}. Please upload ${allowedTypes.join(' or ')} files.`;
  }

  if (file.size === 0) {
    return `File "${file.name}" appears to be empty or corrupted.`;
  }

  return null;
};

const compressFile = async (file: File, isForAI: boolean = false): Promise<File> => {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;

  const options = {
    maxSizeMB: isForAI ? 0.2 : 0.7, // 0.2MB for AI extraction is plenty
    maxWidthOrHeight: isForAI ? 1000 : 1600, // Sufficient for AI OCR
    useWebWorker: true,
    initialQuality: isForAI ? 0.5 : 0.7,
    alwaysKeepResolution: false
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    return new File([compressedBlob], file.name, {
      type: file.type,
      lastModified: Date.now(),
    });
  } catch (error: any) {
    console.warn("Compression error, using original:", error);
    return file;
  }
};

const getFirstPageAsImage = async (file: File): Promise<{ data: string; mimeType: string }> => {
  if (file.type.startsWith('image/')) {
    const compressed = await compressFile(file, true);
    return fileToBase64(compressed);
  }

  if (file.type === 'application/pdf') {
    try {
      const pdfjs = await loadPdfjs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context!, viewport, canvas }).promise;
      const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      return { data: base64, mimeType: 'image/jpeg' };
    } catch (err) {
      console.warn("PDF first page extraction failed, using full file:", err);
      return fileToBase64(file);
    }
  }

  return fileToBase64(file);
};

// Controlled concurrency helper for bulk tasks
const runWithConcurrency = async <T, R>(
  items: T[], 
  concurrency: number, 
  task: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();
  
  for (const item of items) {
    const p = Promise.resolve().then(() => task(item)).then((res) => {
      results.push(res);
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
};

const uploadFile = async (file: File, path: string, onProgress?: (progress: number) => void): Promise<string> => {
  const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
  
  try {
    if (onProgress) {
      const uploadTask = uploadBytesResumable(storageRef, file);
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress(progress);
          }, 
          (error) => {
            console.error("Upload Task Error:", error);
            if (error.code === 'storage/unauthorized') {
              reject(new Error("Permission denied: You don't have access to upload to this location."));
            } else if (error.code === 'storage/quota-exceeded') {
              reject(new Error("Storage quota exceeded. Please contact support."));
            } else {
              reject(new Error(`Upload failed for "${file.name}": ${error.message}`));
            }
          }, 
          () => {
            getDownloadURL(uploadTask.snapshot.ref).then(resolve).catch(reject);
          }
        );
      });
    }

    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Upload Error:", error);
    throw new Error(`Failed to upload "${file.name}": ${error.message}`);
  }
};

const fileDataCache = new Map<string, { data: string; mimeType: string }>();

const fetchFileData = async (url: string): Promise<{ data: string; mimeType: string }> => {
  if (fileDataCache.has(url)) return fileDataCache.get(url)!;

  if (url.startsWith('data:')) {
    const parts = url.split(",");
    const mimePart = url.split(":")[1]?.split(";")[0];
    const res = { data: parts[1], mimeType: mimePart };
    fileDataCache.set(url, res);
    return res;
  }
  
  const response = await fetch(url);
  const blob = await response.blob();
  
  const result: { data: string; mimeType: string } = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve({ data: base64String, mimeType: blob.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  fileDataCache.set(url, result);
  return result;
};

// --- Components ---

const SidebarItem = React.memo(({ 
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
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-left group text-sm sm:text-base",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon className={cn("w-4 h-4 sm:w-5 h-5 transition-transform group-hover:scale-110", active && "text-white")} />
    <span className="font-medium truncate">{label}</span>
    {active && (
      <motion.div 
        layoutId="active-pill" 
        className="ml-auto w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white shrink-0" 
      />
    )}
  </button>
));

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFeature, setActiveFeature] = useState<AppFeature>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [userApiKey, setUserApiKey] = useState<string>(localStorage.getItem("USER_GEMINI_KEY") || "");
  const [aiProvider, setAiProvider] = useState<"google" | "openai">((localStorage.getItem("AI_PROVIDER") as any) || "google");
  
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
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" | "loading" }[]>([]);

  const showToast = (message: string, type: "success" | "error" | "info" | "loading" = "info", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    if (type !== "loading") {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [newBooklet, setNewBooklet] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [useAIForBulkNames, setUseAIForBulkNames] = useState(true);

  const [newExamStudentList, setNewExamStudentList] = useState("");
  const [isManagingStudents, setIsManagingStudents] = useState<string | null>(null); // examId

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [exportProgress, setExportProgress] = useState(0);
  const [currentExportingSubmission, setCurrentExportingSubmission] = useState<Submission | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  
  // Memoized Derived States for performance
  const sortedExams = React.useMemo(() => 
    [...exams].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [exams]
  );

  const sortedSubmissions = React.useMemo(() => 
    [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [submissions]
  );

  const filteredSubmissions = React.useMemo(() => 
    sortedSubmissions.filter(s => s.examId === selectedExamId),
    [sortedSubmissions, selectedExamId]
  );

  const dashboardStats = React.useMemo(() => ({
    totalExams: exams.length,
    totalSubmissions: submissions.length,
    evaluated: submissions.filter(s => s.status === "evaluated").length,
    pending: submissions.filter(s => s.status === "pending").length,
    recentExams: sortedExams.slice(0, 3),
    recentPending: sortedSubmissions.filter(s => s.status === "pending").slice(0, 3)
  }), [exams.length, submissions, sortedExams, sortedSubmissions]);

  const currentSubmission = React.useMemo(() => 
    submissions.find(s => s.id === selectedSubmissionId),
    [submissions, selectedSubmissionId]
  );
  
  // Auth State
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authErrorLocal, setAuthErrorLocal] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const bulkExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    console.log("App mounted, initializing auth...");
    
    // Hide the initial HTML loader
    const initialLoader = document.getElementById('initial-loader');
    if (initialLoader) {
      initialLoader.style.transition = 'opacity 0.5s ease';
      initialLoader.style.opacity = '0';
      setTimeout(() => initialLoader.remove(), 500);
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("Auth state changed:", u ? `User: ${u.uid}` : "No user");
      setUser(u);
      setLoading(false);
      if (u) {
        testConnection().catch(e => console.error("Test connection failed:", e));
      }
    });

    // Safety timeout: if auth hasn't initialized in 8 seconds, force show login screen
    const timeoutId = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn("Auth initialization timed out, showing login screen anyway.");
          return false;
        }
        return prev;
      });
    }, 8000);

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
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
    if (!user) {
      showToast("You must be logged in to create an exam.", "error");
      return;
    }
    
    if (!newExamTitle || !newExamQP || !newExamMS) {
      showToast("Please provide a title, question paper, and marking scheme.", "error");
      return;
    }

    const qpError = validateFile(newExamQP, ['application/pdf', 'image/*']);
    const msError = validateFile(newExamMS, ['application/pdf', 'image/*']);
    
    if (qpError || msError) {
      showToast(qpError || msError, "error");
      return;
    }

    // 10MB limit as requested
    const MAX_FILE_SIZE = 10 * 1024 * 1024; 
    if (newExamQP.size > MAX_FILE_SIZE || newExamMS.size > MAX_FILE_SIZE) {
      showToast("Files are too large. Each file must be under 10MB.", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus("Preparing files...");
    
    try {
      setUploadStatus("Compressing files...");
      const [compressedQP, compressedMS] = await Promise.all([
        compressFile(newExamQP),
        compressFile(newExamMS)
      ]);

      setUploadStatus("Uploading to Storage...");
      let qpProgress = 0;
      let msProgress = 0;

      const updateOverallProgress = () => {
        setUploadProgress((qpProgress + msProgress) / 2);
      };

      const [qpUrl, msUrl] = await Promise.all([
        uploadFile(compressedQP, `exams/${user.uid}/qp`, (p) => { qpProgress = p; updateOverallProgress(); }),
        uploadFile(compressedMS, `exams/${user.uid}/ms`, (p) => { msProgress = p; updateOverallProgress(); })
      ]);
      
      setUploadStatus("Finalizing exam...");
      setUploadProgress(100);
      
      const result = await createExam({
        uid: user.uid,
        title: newExamTitle,
        questionPaperUrl: qpUrl,
        markingSchemeUrl: msUrl,
        studentList: newExamStudentList.split('\n').map(s => s.trim()).filter(s => s !== ""),
        createdAt: new Date().toISOString()
      });
      
      setIsCreatingExam(false);
      setNewExamTitle("");
      setNewExamQP(null);
      setNewExamMS(null);
      setNewExamStudentList("");
    } catch (error: any) {
      console.error("Create Exam Error:", error);
      let message = "Failed to create exam. ";
      
      if (error.message?.includes("corrupted") || error.message?.includes("not a valid image")) {
        message += "One of the files appears to be corrupted or is not a valid image.";
      } else if (error.message?.includes("quota") || error.message?.includes("limit")) {
        message += "This might be due to storage limits or the 1MB document size limit in Firestore.";
      } else if (error.message?.includes("permission") || error.message?.includes("denied")) {
        message += "Permission denied. Please make sure you are logged in.";
      } else {
        try {
          const errData = JSON.parse(error.message);
          message += `Error: ${errData.error || "Unknown error"}`;
        } catch (e) {
          message += error.message || "An unexpected error occurred.";
        }
      }
      showToast(message, "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
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
      const bookletDataForAI = await getFirstPageAsImage(file);
      const details = await extractStudentDetails(bookletDataForAI);
      if (details.studentName) {
        setNewStudentName(details.studentName);
      }
    } catch (err: any) {
      console.error("Scan Details Error:", err);
      if (err.message?.includes("AI_ERROR_SAFETY")) {
        showToast("Could not scan details: AI safety filter triggered.", "error");
      } else if (err.message?.includes("AI_ERROR_EMPTY")) {
        showToast("Could not scan details: Vision was unclear.", "error");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    let studentName = newStudentName;
    if (!selectedExamId || !newBooklet) {
      showToast("Please provide a booklet.", "error");
      return;
    }

    const bookletError = validateFile(newBooklet, ['application/pdf', 'image/*']);
    if (bookletError) {
      showToast(bookletError, "error");
      return;
    }

    // 10MB limit as requested
    const MAX_FILE_SIZE = 10 * 1024 * 1024; 
    if (newBooklet.size > MAX_FILE_SIZE) {
      showToast("Booklet file is too large. It must be under 10MB.", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus("Preparing booklet...");
    
    try {
      setUploadStatus("Processing booklet...");
      
      // Start compression and identification concurrently
      // Optimization: extract only first page/compressed for AI to save time
      const [compressedBooklet, bookletDataForAI] = await Promise.all([
        compressFile(newBooklet),
        !studentName ? getFirstPageAsImage(newBooklet) : Promise.resolve(null)
      ]);

      if (!studentName && bookletDataForAI) {
        setUploadStatus("Identifying student...");
        try {
          const details = await extractStudentDetails(bookletDataForAI);
          studentName = details.studentName;
        } catch (err) {
          console.warn("AI extraction failed:", err);
        }
      }

      if (!studentName) {
        showToast("Could not identify student. Please enter manually.", "error");
        setIsUploading(false);
        return;
      }

      setUploadStatus("Uploading to Storage...");
      const bookletUrl = await uploadFile(compressedBooklet, `submissions/${user!.uid}/${selectedExamId}`, (p) => setUploadProgress(p));
      
      setUploadStatus("Finalizing submission...");
      setUploadProgress(100);

      await createSubmission({
        uid: user!.uid,
        examId: selectedExamId,
        studentName: studentName,
        bookletUrl: bookletUrl,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      setIsAddingSubmission(false);
      setNewStudentName("");
      setNewBooklet(null);
    } catch (error: any) {
      console.error("Add Submission Error:", error);
      let message = "Failed to add submission. ";
      
      if (error.message?.includes("corrupted") || error.message?.includes("not a valid image")) {
        message += "The file appears to be corrupted or is not a valid image.";
      } else if (error.message?.includes("quota")) {
        message += "Storage quota exceeded.";
      } else {
        try {
          const errData = JSON.parse(error.message);
          message += `Error: ${errData.error || "Unknown error"}`;
        } catch (e) {
          message += error.message || "An unexpected error occurred.";
        }
      }
      showToast(message, "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedExamId || bulkFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Preparing ${bulkFiles.length} files...`);
    
    let successCount = 0;
    let failCount = 0;
    const totalFiles = bulkFiles.length;
    const fileProgresses: { [key: string]: number } = {};

    const updateOverallProgress = () => {
      const totalProgress = Object.values(fileProgresses).reduce((a, b) => a + b, 0);
      setUploadProgress(totalProgress / totalFiles);
    };

    try {
      const uploadSingleFile = async (file: File) => {
        const fileError = validateFile(file, ['application/pdf', 'image/*']);
        if (fileError) {
          console.warn(`Skipping ${file.name}: ${fileError}`);
          failCount++;
          return;
        }

        const MAX_FILE_SIZE = 25 * 1024 * 1024; // Increased for better UX, compression handles it
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`Skipping ${file.name}: File is too large. Max 25MB.`);
          failCount++;
          return;
        }

        // Use filename immediately for maximum speed
        const tempStudentName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").replace(/-/g, " ");
        
        // Fast compression
        const compressedFile = await compressFile(file);
        
        const bookletUrl = await uploadFile(compressedFile, `submissions/${user.uid}/${selectedExamId}`, (p) => {
          fileProgresses[file.name] = p;
          updateOverallProgress();
        });

        const newSubmission = await createSubmission({
          uid: user.uid,
          examId: selectedExamId,
          studentName: tempStudentName,
          bookletUrl: bookletUrl,
          status: "pending",
          createdAt: new Date().toISOString()
        });
        
        if (!newSubmission) throw new Error("Failed to create submission");

        successCount++;
        fileProgresses[file.name] = 100;
        updateOverallProgress();

        // QUEUE AI Background Scanning - doesn't block the upload loop
        if (useAIForBulkNames) {
          // We don't await this so the loop continues instantly
          (async () => {
            try {
              const bookletDataForAI = await getFirstPageAsImage(file);
              const details = await extractStudentDetails(bookletDataForAI);
              if (details.studentName && details.studentName !== "Unknown") {
                await updateSubmission(newSubmission.id, { studentName: details.studentName });
              }
            } catch (err) {
              console.warn(`Background AI scan failed for ${file.name}`);
            }
          })();
        }
      };

      // Process with concurrency limit to avoid freezing the browser
      await runWithConcurrency(bulkFiles, 3, async (file) => {
        if (file.name.toLowerCase().endsWith('.zip')) {
          setUploadStatus(`Extracting ${file.name}...`);
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          const zipFiles = Object.values(contents.files).filter((f: any) => !f.dir);
          
          // Internal zip files also with limited concurrency
          await runWithConcurrency(zipFiles, 2, async (zipEntry: any) => {
            const blob = await zipEntry.async("blob");
            const extractedFile = new File([blob], zipEntry.name, { type: blob.type || "application/octet-stream" });
            await uploadSingleFile(extractedFile);
          });
        } else {
          await uploadSingleFile(file);
        }
      });

      if (failCount === 0) {
        showToast(`Bulk upload complete! ${successCount} submissions added successfully.`, "success");
      } else if (successCount === 0) {
        showToast(`Bulk upload failed. All ${failCount} files had issues.`, "error");
      } else {
        showToast(`Bulk upload partially complete. ${successCount} added, ${failCount} failed.`, "info");
      }
      setIsBulkAddingSubmissions(false);
      setBulkFiles([]);
    } catch (error: any) {
      console.error("Bulk Upload Error:", error);
      showToast("An error occurred during bulk upload.", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus("");
    }
  };

  const handleExportAllData = () => {
    try {
      const exportData = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        exams,
        submissions
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `grademaster_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast("All data successfully exported.", "success");
    } catch (err) {
      showToast("Failed to export data.", "error");
    }
  };

  const handleImportData = async (file: File) => {
    if (!user) return;
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData.exams || !importData.submissions) {
        throw new Error("Invalid backup file format.");
      }

      showToast("Restoring records...", "loading");
      
      // We don't want to just overwrite everything blindly, but for "Indigenous" restoration
      // we'll batch create them.
      for (const exam of importData.exams) {
        const { id, ...examData } = exam;
        await createExam({ ...examData, uid: user.uid });
      }
      
      for (const sub of importData.submissions) {
        const { id, ...subData } = sub;
        await createSubmission({ ...subData, uid: user.uid });
      }
      
      showToast(`Restored ${importData.exams.length} exams and ${importData.submissions.length} submissions.`, "success");
    } catch (err: any) {
      showToast(`Import failed: ${err.message}`, "error");
    }
  };

  const handleEvaluate = async (submission: Submission, silent: boolean = false) => {
    const exam = exams.find(e => e.id === submission.examId);
    if (!exam) return;

    if (!silent) setIsEvaluating(true);
    try {
      console.log("Fetching document data...");
      const [qp, ms, booklet] = await Promise.all([
        fetchFileData(exam.questionPaperUrl),
        fetchFileData(exam.markingSchemeUrl),
        fetchFileData(submission.bookletUrl)
      ]);

      console.log("Starting AI evaluation...");
      const result = await evaluateExam(qp, ms, booklet);
      
      await updateSubmission(submission.id!, {
        status: "evaluated",
        totalMarks: result.totalMarks,
        maxMarks: result.maxMarks,
        evaluationData: { questions: result.questions }
      });
      
      if (!silent) setEvaluationResult(result);
    } catch (error: any) {
      console.error("Evaluation Error:", error);
      
      if (!silent) {
        let feedback = "Evaluation failed. ";
        const msg = error.message || "";
        
        if (msg.includes("Invalid document format") || msg.includes("Could not determine document type")) {
          feedback += "One of the uploaded documents seems to be corrupted or in an unsupported format.";
        } else if (msg.includes("AI_ERROR_SAFETY")) {
          feedback += "The AI safety filter was triggered. Please ensure the documents contain only educational content and no restricted material.";
        } else if (msg.includes("AI_ERROR_RECITATION")) {
          feedback += "The AI detected potentially copyrighted material and blocked the response.";
        } else if (msg.includes("AI_ERROR_EMPTY")) {
          feedback += "The AI could not read the documents. This usually happens if the handwriting is too unclear, the images are too blurry, or the pages are poorly lit.";
        } else if (msg.includes("AI_ERROR_FORMAT")) {
          feedback += "The AI returned an unreadable response. This can happen if the documents are extremely complex or the scan quality is very low.";
        } else if (msg.includes("AI_ERROR_QUOTA")) {
          feedback += "The AI service is currently busy or the quota has been reached. Please wait a minute and try again.";
        } else if (msg.includes("AI_ERROR_SERVER")) {
          feedback += "The AI server encountered an error. Please try again later.";
        } else {
          feedback += "\n\nSuggested checks:\n" +
            "• Ensure all pages are clearly visible and well-lit.\n" +
            "• Check if the student booklet matches the question paper.\n" +
            "• Verify that the marking scheme is complete.\n" +
            "• Try re-uploading the documents if the problem persists.";
        }
        
        showToast(feedback, "error", 10000);
      } else {
        throw error;
      }
    } finally {
      if (!silent) setIsEvaluating(false);
    }
  };

  const handleBulkEvaluate = async () => {
    const pending = submissions.filter(s => s.examId === selectedExamId && s.status === "pending");
    if (pending.length === 0) {
      showToast("No pending submissions to evaluate.", "info");
      return;
    }

    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) return;

    if (!confirm(`Evaluate all ${pending.length} pending submissions? This will be processed in parallel.`)) return;

    setIsEvaluating(true);
    let success = 0;
    let failed = 0;

    try {
      // PRE-FETCH Question Paper and Marking Scheme once for the entire batch
      console.log("Caching exam materials for batch evaluation...");
      const [qp, ms] = await Promise.all([
        fetchFileData(exam.questionPaperUrl),
        fetchFileData(exam.markingSchemeUrl)
      ]);

      await runWithConcurrency(pending, 2, async (submission) => {
        try {
          // Fetch only the student's unique booklet data
          const booklet = await fetchFileData(submission.bookletUrl);
          
          console.log(`Starting AI evaluation for ${submission.studentName}...`);
          const result = await evaluateExam(qp, ms, booklet);
          
          await updateSubmission(submission.id!, {
            status: "evaluated",
            totalMarks: result.totalMarks,
            maxMarks: result.maxMarks,
            evaluationData: { questions: result.questions }
          });
          
          success++;
        } catch (err: any) {
          console.error(`Failed to evaluate ${submission.studentName}:`, err);
          failed++;
        }
      });
      showToast(`Bulk evaluation complete! ✅ Success: ${success} ❌ Failed: ${failed}`, "info");
    } catch (err: any) {
      console.error("Batch Initialization Error:", err);
      showToast("Evaluation failed to start. Check your network connection.", "error");
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
      showToast("Failed to update exam.", "error");
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
      showToast("Failed to delete exam.", "error");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async (submission?: Submission) => {
    const sub = submission || currentSubmission;
    if (!sub) return;
    
    setIsExporting(true);
    setCurrentExportingSubmission(sub);
    
    try {
      // Dynamic imports for performance
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default || html2canvasModule;
      
      const jspdfModule = await import("jspdf");
      const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;

      // Wait for the hidden component to render and images to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (bulkExportRef.current) {
        const canvas = await (typeof html2canvas === 'function' ? html2canvas : html2canvas.default)(bulkExportRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#020617", // Keep the app's dark theme for the PDF
          logging: false,
          onclone: (clonedDoc: Document) => {
            fixHtml2CanvasOklch(clonedDoc);
          }
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new (typeof jsPDF === 'function' ? jsPDF : jsPDF.jsPDF)('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeightInPdf = (imgProps.height * pdfWidth) / imgProps.width;
        
        let heightLeft = imgHeightInPdf;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightInPdf);
        heightLeft -= pdfHeight;

        // Add subsequent pages if content is longer than one page
        while (heightLeft > 0) {
          position = heightLeft - imgHeightInPdf;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightInPdf);
          heightLeft -= pdfHeight;
        }
        
        const examTitle = exams.find(e => e.id === sub.examId)?.title || "Exam";
        const fileName = `Evaluation_${examTitle.replace(/\s+/g, '_')}_${sub.studentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);
      }
    } catch (err) {
      console.error("PDF Export Error:", err);
      showToast("Failed to export PDF. Please try again.", "error");
    } finally {
      setIsExporting(false);
      // Only clear if we're not in a bulk export process
      if (!isBulkExporting) {
        setCurrentExportingSubmission(null);
      }
    }
  };

  const exportGradesCSV = (examId?: string) => {
    const targetExamId = examId || selectedExamId;
    const currentExam = exams.find(e => e.id === targetExamId);
    if (!currentExam) return;

    const examSubmissions = submissions.filter(s => s.examId === targetExamId);
    if (examSubmissions.length === 0) {
      showToast("No submissions to export.", "info");
      return;
    }

    // Determine headers
    const maxQuestions = Math.max(...examSubmissions.map(s => s.evaluationData?.questions.length || 0));
    const questionHeaders = Array.from({ length: maxQuestions }, (_, i) => `Q${i + 1} Marks`).join(",");
    const csvRows = [
      `Student Name,Status,Total Marks,Max Marks,Percentage,${questionHeaders}`
    ];

    examSubmissions.forEach(sub => {
      const isEvaluated = sub.status === "evaluated";
      const percentage = isEvaluated ? ((sub.totalMarks / sub.maxMarks) * 100).toFixed(2) + "%" : "N/A";
      const qMarks = Array.from({ length: maxQuestions }, (_, i) => {
        if (!isEvaluated) return "";
        return sub.evaluationData?.questions[i]?.marksAwarded ?? "";
      }).join(",");
      
      csvRows.push(`"${sub.studentName.replace(/"/g, '""')}",${sub.status},${isEvaluated ? sub.totalMarks : ""},${isEvaluated ? sub.maxMarks : ""},${percentage},${qMarks}`);
    });

    const csvContent = "\ufeff" + csvRows.join("\n"); // Add BOM for Excel UTF-8 support
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Detailed_Grades_${currentExam.title.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkExportPDFs = async () => {
    const evaluatedSubmissions = submissions.filter(s => s.examId === selectedExamId && s.status === "evaluated");
    if (evaluatedSubmissions.length === 0) {
      showToast("No evaluated submissions to export.", "info");
      return;
    }

    setIsBulkExporting(true);
    setExportProgress(0);
    
    try {
      // Dynamic imports for performance
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default || html2canvasModule;
      
      const jspdfModule = await import("jspdf");
      const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
      
      const jszipModule = await import("jszip");
      const JSZipConstruct = jszipModule.default || jszipModule;
      
      const zip = new (JSZipConstruct as any)();

      for (let i = 0; i < evaluatedSubmissions.length; i++) {
        const sub = evaluatedSubmissions[i];
        setExportProgress(((i) / evaluatedSubmissions.length) * 100);
        setCurrentExportingSubmission(sub);
        
        // Wait for the hidden component to render and images to load
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (bulkExportRef.current) {
          const canvas = await (typeof html2canvas === 'function' ? html2canvas : html2canvas.default)(bulkExportRef.current, {
            scale: 1.5,
            useCORS: true,
            backgroundColor: "#020617",
            logging: false,
            onclone: (clonedDoc: Document) => {
              fixHtml2CanvasOklch(clonedDoc);
            }
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pdf = new (typeof jsPDF === 'function' ? jsPDF : jsPDF.jsPDF)('p', 'mm', 'a4');
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
          
          const pdfBlob = pdf.output('blob');
          const fileName = `${sub.studentName.replace(/\s+/g, '_')}_Evaluation.pdf`;
          zip.file(fileName, pdfBlob);
        }
      }

      setExportProgress(100);
      const content = await zip.generateAsync({ type: "blob" });
      const examTitle = exams.find(e => e.id === selectedExamId)?.title || "Exam";
      const zipName = `${examTitle.replace(/\s+/g, '_')}_Reports.zip`;
      
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipName;
      link.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error("Bulk Export Error:", err);
      showToast("Failed to export reports. Some files might be missing.", "error");
    } finally {
      setIsBulkExporting(false);
      setCurrentExportingSubmission(null);
      setExportProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-10"
        >
          <div className="relative">
            <div className="w-24 h-24 bg-blue-600/10 rounded-[32px] flex items-center justify-center border border-blue-500/20 shadow-2xl shadow-blue-900/40">
              <GraduationCap className="w-12 h-12 text-blue-500" />
            </div>
            {/* Pulsing ring animation */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
              className="absolute inset-0 bg-blue-500 rounded-[32px]"
            />
            {/* Rotating dashed ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-4 border border-dashed border-slate-800 rounded-full"
            />
          </div>
          
          <div className="text-center space-y-4">
            <h3 className="text-4xl font-extrabold text-white tracking-tighter">
              GradeMaster <span className="text-blue-500 font-black">AI</span>
            </h3>
            <div className="flex items-center justify-center gap-3">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Initializing Intelligence</p>
              <div className="flex gap-1">
                <motion.span 
                  animate={{ opacity: [0, 1, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
                  className="w-1.5 h-1.5 bg-blue-500 rounded-full"
                />
                <motion.span 
                  animate={{ opacity: [0, 1, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
                  className="w-1.5 h-1.5 bg-blue-500 rounded-full"
                />
                <motion.span 
                  animate={{ opacity: [0, 1, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
                  className="w-1.5 h-1.5 bg-blue-500 rounded-full"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthErrorLocal(null);
      setAuthLoading(true);
      try {
        if (authMode === "login") {
          await loginWithEmail(authEmail, authPassword);
        } else if (authMode === "signup") {
          if (!authName) throw new Error("Please enter your name.");
          await signUpWithEmail(authEmail, authPassword, authName);
        } else if (authMode === "forgot") {
          await resetPassword(authEmail);
          setResetSent(true);
        }
      } catch (err: any) {
        setAuthErrorLocal(err.message || "Authentication failed.");
      } finally {
        setAuthLoading(false);
      }
    };

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-6 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/10">
              <GraduationCap className="w-10 h-10 text-blue-500" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">GradeMaster AI</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              {authMode === "login" && "Welcome back! Please sign in to continue."}
              {authMode === "signup" && "Create your account to start evaluating exams."}
              {authMode === "forgot" && "Enter your email to receive a reset link."}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 space-y-6 shadow-2xl">
            {resetSent && authMode === "forgot" ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-sm text-slate-300">Password reset link has been sent to your email.</p>
                <button 
                  onClick={() => { setAuthMode("login"); setResetSent(false); }}
                  className="text-blue-500 font-bold text-sm hover:underline"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {authErrorLocal && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-2 text-red-400 text-xs font-bold animate-shake">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{authErrorLocal}</span>
                    </div>
                    {authErrorLocal.includes("Network request failed") && (
                      <button 
                        type="button"
                        onClick={() => window.open(window.location.href, '_blank')}
                        className="mt-2 py-2.5 bg-white/5 border border-white/10 rounded-xl text-center hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Fix: Open in New Tab
                      </button>
                    )}
                  </div>
                )}

                {authMode === "signup" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:border-blue-600 outline-none transition-colors text-white placeholder:text-slate-700"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@university.edu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:border-blue-600 outline-none transition-colors text-white placeholder:text-slate-700"
                  />
                </div>

                {authMode !== "forgot" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                      {authMode === "login" && (
                        <button 
                          type="button"
                          onClick={() => setAuthMode("forgot")}
                          className="text-[10px] font-bold text-blue-500 hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <input 
                      type="password" 
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:border-blue-600 outline-none transition-colors text-white placeholder:text-slate-700"
                    />
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all active:scale-95 shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                  {authMode === "login" ? "Sign In" : authMode === "signup" ? "Create Account" : "Send Reset Link"}
                </button>
              </form>
            )}

            <div className="relative flex items-center gap-4 text-slate-700">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] font-black uppercase tracking-widest">Optional</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <button
              onClick={() => signInWithGoogle().catch(err => setAuthErrorLocal(err.message))}
              className="w-full py-3.5 px-6 bg-slate-800 text-white/70 text-sm font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 opacity-50 gray" style={{ filter: 'grayscale(1)' }} alt="" />
              Social Login (Google)
            </button>

            <div className="text-center pt-2">
              <button 
                onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                className="text-sm font-bold text-slate-400 hover:text-white transition-colors"
              >
                {authMode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
              {authMode === "forgot" && (
                <div className="mt-2 text-center">
                  <button 
                    onClick={() => setAuthMode("login")}
                    className="text-xs font-bold text-slate-500 hover:text-white transition-colors"
                  >
                    Back to Login
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }



  return (
    <div className="h-screen w-full flex bg-slate-950 overflow-hidden font-sans text-slate-200">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[200] bg-orange-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-3 h-3" />
            Offline Mode: AI Grading & Uploads Suspended. Viewing local data.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="fixed lg:relative w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-50 shadow-2xl lg:shadow-none"
          >
            <div className="p-6 lg:p-8 flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white">GradeMaster</h1>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-lg lg:hidden"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
              <SidebarItem 
                icon={LayoutDashboard} 
                label="Dashboard" 
                active={activeFeature === "dashboard"} 
                onClick={() => { setActiveFeature("dashboard"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={BookOpen} 
                label="My Exams" 
                active={activeFeature === "exams"} 
                onClick={() => { setActiveFeature("exams"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={FileCheck} 
                label="Submissions" 
                active={activeFeature === "submissions"} 
                onClick={() => { setActiveFeature("submissions"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={Users} 
                label="Students" 
                active={activeFeature === "students"} 
                onClick={() => { setActiveFeature("students"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={Info} 
                label="About App" 
                active={activeFeature === "about"} 
                onClick={() => { setActiveFeature("about"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
              />
              {user?.email === "pbnavaneeth01@gmail.com" && (
                <SidebarItem 
                  icon={Cpu} 
                  label="Settings" 
                  active={activeFeature === "settings"} 
                  onClick={() => { setActiveFeature("settings"); setSelectedExamId(null); setSelectedSubmissionId(null); if (window.innerWidth < 1024) setSidebarOpen(false); }} 
                />
              )}
            </nav>

            <div className="p-6 border-t border-slate-800">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/50 mb-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-slate-700 bg-blue-600 flex items-center justify-center text-white font-bold text-sm uppercase">
                    {(user.displayName || user.email || "?").charAt(0)}
                  </div>
                )}
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
        <header className="h-20 border-b border-slate-800 flex items-center px-4 sm:px-8 gap-2 sm:gap-4 bg-slate-950/80 backdrop-blur-xl z-40 shrink-0">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-slate-800 mx-1 sm:mx-2" />
          <div className="flex-1 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium min-w-0">
            <span className="text-slate-500 capitalize shrink-0">{activeFeature}</span>
            {selectedExamId && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" />
                <span className="text-white truncate">{exams.find(e => e.id === selectedExamId)?.title}</span>
              </>
            )}
            {selectedSubmissionId && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" />
                <span className="text-white truncate">{submissions.find(s => s.id === selectedSubmissionId)?.studentName}</span>
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12">
          <AnimatePresence mode="wait">
            {activeFeature === "dashboard" && (
              <DashboardView 
                stats={dashboardStats} 
                onNavigate={(feature, examId) => {
                  setActiveFeature(feature);
                  if (examId) setSelectedExamId(examId);
                }}
              />
            )}

            {activeFeature === "exams" && (
              <motion.div
                key="exams"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Exams</h1>
                    <p className="text-slate-500">Create and manage your examination papers.</p>
                  </div>
                  <button 
                    onClick={() => setIsCreatingExam(true)}
                    disabled={!isOnline}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                  >
                    <Plus className="w-5 h-5" />
                    {isOnline ? "New Exam" : "Offline: New Exam Disabled"}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dashboardStats.recentExams.map(exam => (
                    <ExamItem 
                      key={exam.id} 
                      exam={exam} 
                      onSelect={() => { setSelectedExamId(exam.id!); setActiveFeature("submissions"); }}
                      onEdit={() => setEditingExam(exam)}
                      onDelete={() => handleDeleteExam(exam.id!)}
                      onManageStudents={() => {
                        setIsManagingStudents(exam.id!);
                        setNewExamStudentList(exam.studentList?.join('\n') || "");
                      }}
                    />
                  ))}
                </div>

                {exams.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-[32px] flex items-center justify-center mb-8 shadow-inner">
                      <BookOpen className="w-12 h-12 text-slate-700" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-4">No exams yet</h2>
                    <p className="text-slate-500 max-w-md mb-10 text-lg">Create your first exam by uploading a question paper and marking scheme.</p>
                    <button 
                      onClick={() => setIsCreatingExam(true)}
                      className="flex items-center gap-3 px-10 py-5 bg-blue-600 text-white font-bold rounded-3xl hover:bg-blue-500 transition-all shadow-2xl shadow-blue-900/40"
                    >
                      <Plus className="w-6 h-6" />
                      Create Your First Exam
                    </button>
                  </div>
                )}

                {isCreatingExam && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Create New Exam</h2>
                        <button onClick={() => setIsCreatingExam(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                        </button>
                      </div>
                      <form onSubmit={handleCreateExam} className="space-y-8">
                        <div className="flex flex-col md:flex-row items-end gap-4">
                          <div className="flex-1 space-y-2 w-full">
                            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Exam Title</label>
                            <input 
                              required
                              value={newExamTitle}
                              onChange={(e) => setNewExamTitle(e.target.value)}
                              placeholder="e.g. Mathematics Final 2024"
                              className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                            />
                          </div>
                          <button 
                            type="submit"
                            disabled={loading || !newExamQP || !newExamMS}
                            className="h-[60px] px-8 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            {loading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <>
                                <Plus className="w-5 h-5" />
                                <span>Create Exam</span>
                              </>
                            )}
                          </button>
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

                        {newExamQP && newExamMS && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8"
                          >
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
                          </motion.div>
                        )}

                        {(!newExamQP || !newExamMS) && (
                          <div className="p-6 border border-dashed border-slate-800 rounded-3xl text-center">
                            <p className="text-slate-500 text-sm">Please upload both the Question Paper and Marking Scheme to continue.</p>
                          </div>
                        )}
                      </form>
                    </motion.div>
                  </div>
                )}

                {editingExam && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
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
              >
                <SubmissionsView 
                  exam={exams.find(e => e.id === selectedExamId)}
                  submissions={filteredSubmissions}
                  onNavigate={setActiveFeature}
                  onBulkEvaluate={handleBulkEvaluate}
                  onSingleEvaluate={(sub) => { setSelectedSubmissionId(sub.id!); setActiveFeature("evaluate"); }}
                  onAddSubmission={() => setIsAddingSubmission(true)}
                  onBulkAddSubmissions={() => setIsBulkAddingSubmissions(true)}
                  onExportCSV={() => exportGradesCSV()}
                  onDeleteSubmission={deleteSubmission}
                  isEvaluating={isEvaluating}
                  isOnline={isOnline}
                />

                {isAddingSubmission && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                          disabled={isUploading}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {isUploading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Add Submission"}
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}

                {isBulkAddingSubmissions && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                          disabled={isUploading || bulkFiles.length === 0}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                        >
                          {isUploading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Start Bulk Upload"}
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
                                showToast("Failed to update student list", "error");
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
                className="max-w-6xl mx-auto px-1 sm:px-0"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setActiveFeature("submissions")} className="p-2 hover:bg-slate-800 rounded-lg transition-colors shrink-0">
                      <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div className="min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 truncate">Evaluation</h1>
                      <p className="text-sm text-slate-500 truncate">Results for {currentSubmission.studentName}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:gap-3 w-full lg:w-auto">
                    {currentSubmission.status === "evaluated" && (
                      <button 
                        onClick={() => exportPDF()}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all border border-slate-700 text-xs sm:text-sm"
                      >
                        <Download className="w-4 h-4 sm:w-5 h-5" />
                        <span className="truncate">Export PDF</span>
                      </button>
                    )}
                    <button 
                      onClick={() => handleEvaluate(currentSubmission)}
                      disabled={isEvaluating}
                      className="flex-[2] lg:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all disabled:opacity-50 text-xs sm:text-sm shadow-lg shadow-blue-500/20"
                    >
                      {isEvaluating ? <Loader2 className="w-4 h-4 sm:w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4 sm:w-5 h-5" />}
                      <span className="truncate">{currentSubmission.status === "evaluated" ? "Re-evaluate" : "Start Evaluation"}</span>
                    </button>
                  </div>
                </div>

                {isEvaluating ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 px-6">
                    <div className="relative">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-blue-600/20 rounded-full animate-ping absolute inset-0" />
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-blue-600/40 rounded-full flex items-center justify-center relative">
                        <BrainCircuit className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">AI is analyzing the booklet...</h2>
                      <p className="text-sm text-slate-500 max-w-xs mx-auto">Handwriting transcription and logic verification in progress. This usually takes 30-45 seconds.</p>
                    </div>
                  </div>
                ) : currentSubmission.status === "evaluated" ? (
                  <div className="space-y-6 lg:space-y-10">
                    <div ref={reportRef} className="space-y-8 sm:space-y-10 bg-slate-900 border border-slate-800 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-8 sm:pb-10 gap-6">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">{currentSubmission.studentName}</h2>
                            <div className="px-3 py-1 bg-purple-600/10 border border-purple-500/20 rounded-full flex items-center gap-1.5 shrink-0">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest leading-none">AI Active</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Exam</span>
                            <p className="text-xs sm:text-sm font-medium text-slate-500">{exams.find(e => e.id === currentSubmission.examId)?.title}</p>
                          </div>
                        </div>
                        <div className="sm:text-right bg-slate-800/30 p-4 sm:p-0 rounded-2xl sm:bg-transparent">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Final Score</p>
                          <div className="flex flex-col sm:items-end">
                            <p className="text-4xl sm:text-5xl font-black text-blue-500">{currentSubmission.totalMarks} <span className="text-xl sm:text-2xl text-slate-700">/ {currentSubmission.maxMarks}</span></p>
                            <p className="text-lg font-bold text-blue-400/80 mt-1">
                              {((currentSubmission.totalMarks / currentSubmission.maxMarks) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <FileCheck className="w-5 h-5 text-blue-500" />
                          Marking Analysis
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {currentSubmission.evaluationData?.questions.map((q: EvaluationQuestion, i: number) => (
                            <div key={i} className="p-5 sm:p-8 rounded-[24px] sm:rounded-3xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                <div className="flex items-center gap-3">
                                  <span className="w-10 h-10 bg-blue-600 text-white text-sm font-bold rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 shrink-0">Q{q.questionNumber}</span>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</p>
                                    <p className="text-xs font-bold text-white">Page {q.pageNumber}</p>
                                  </div>
                                </div>
                                <div className="self-start sm:self-auto px-4 py-2 bg-slate-950 rounded-xl text-sm font-bold text-blue-400 border border-slate-800 flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mr-1">Awarded</span>
                                  {q.marksAwarded} / {q.maxMarks}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    Handwriting Transcription
                                  </p>
                                  <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/50 min-h-[80px]">
                                    <p className="text-sm text-slate-300 italic leading-relaxed">"{q.transcription}"</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    Correction Feedback
                                  </p>
                                  <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 min-h-[80px]">
                                    <p className="text-sm text-slate-300 leading-relaxed">{q.feedback}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="px-1 sm:px-0">
                      <React.Suspense fallback={<div className="h-64 flex flex-col items-center justify-center space-y-4 bg-slate-900/50 rounded-3xl border border-slate-800"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /><p className="text-slate-500 font-medium">Loading evaluation tools...</p></div>}>
                        <BookletAnnotator 
                          bookletUrl={currentSubmission.bookletUrl} 
                          questions={currentSubmission.evaluationData?.questions || []} 
                        />
                      </React.Suspense>
                    </div>
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 sm:p-10 bg-slate-900/50 border border-slate-800 border-dashed rounded-[32px] sm:rounded-[40px]">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-slate-600" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Ready for Evaluation</h2>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto mb-8">This student's booklet is uploaded and ready for the AI to perform the semantic grading process.</p>
                    <button 
                       onClick={() => handleEvaluate(currentSubmission)}
                       className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                    >
                      Start Evaluation Now
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {activeFeature === "about" && (
              <AboutView />
            )}

            {activeFeature === "settings" && user?.email === "pbnavaneeth01@gmail.com" && (
              <SettingsView 
                userApiKey={userApiKey}
                onSaveApiKey={(key) => {
                  setUserApiKey(key);
                  localStorage.setItem("USER_GEMINI_KEY", key);
                  showToast("API Settings updated successfully", "success");
                }}
                aiProvider={aiProvider}
                setAiProvider={(p) => {
                  setAiProvider(p);
                  localStorage.setItem("AI_PROVIDER", p);
                  showToast(`Provider switched to ${p}`, "info");
                }}
                onExport={handleExportAllData}
                onImport={handleImportData}
                onResetPassword={async () => {
                  if (!user || !user.email) return;
                  try {
                    setLoading(true);
                    await resetPassword(user.email);
                    showToast("Reset password link sent to your email", "success");
                  } catch (err: any) {
                    showToast(`Failed to send reset link: ${err.message}`, "error");
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {isUploading && (
          <UploadProgressOverlay progress={uploadProgress} status={uploadStatus} />
        )}
        {isExporting && !isBulkExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex flex-col items-center justify-center p-8"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-10 flex flex-col items-center gap-6 shadow-2xl">
              <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-1">Generating PDF...</h3>
                <p className="text-slate-500 text-sm">Please wait while we prepare your report.</p>
              </div>
            </div>
          </motion.div>
        )}
        {isBulkExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-8"
          >
            <div className="w-full max-w-md space-y-8 text-center">
              <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Download className="w-10 h-10 text-blue-400 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Exporting PDFs...</h3>
                <p className="text-slate-400">Generating report for {currentExportingSubmission?.studentName}</p>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-blue-500 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${exportProgress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {Math.round(exportProgress)}% Complete
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Export Container */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none opacity-0">
        {currentExportingSubmission && (
          <div ref={bulkExportRef} className="w-[800px] bg-slate-950 p-10 space-y-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-10">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">{currentExportingSubmission.studentName}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Exam</span>
                  <p className="text-sm font-medium text-slate-400">{exams.find(e => e.id === currentExportingSubmission.examId)?.title}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-1">Total Score</p>
                <p className="text-5xl font-black text-blue-500">{currentExportingSubmission.totalMarks} <span className="text-2xl text-slate-700">/ {currentExportingSubmission.maxMarks}</span></p>
                <p className="text-2xl font-bold text-blue-400 mt-2">
                  {((currentExportingSubmission.totalMarks / currentExportingSubmission.maxMarks) * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">Question-wise Breakdown</h3>
              <div className="grid grid-cols-1 gap-4">
                {currentExportingSubmission.evaluationData?.questions.map((q: EvaluationQuestion, i: number) => (
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
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Transcription</p>
                        <p className="text-sm text-slate-300 italic">"{q.transcription}"</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">AI Feedback</p>
                        <p className="text-sm text-slate-400">{q.feedback}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Toasts Container */}
      <div className="fixed bottom-8 left-0 right-0 z-[1000] pointer-events-none flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast 
                message={toast.message} 
                type={toast.type} 
                onClose={() => removeToast(toast.id)} 
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
