import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { collection, query, where, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
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
  AlertTriangle,
  Settings,
  User as UserIcon,
  Camera,
  Folders
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
import { MultiFileUpload } from "./components/Upload";

const BookletAnnotator = React.lazy(() => import("./components/Evaluation").then(m => ({ default: m.BookletAnnotator })));
const DashboardView = React.lazy(() => import("./components/DashboardView").then(m => ({ default: m.DashboardView })));
const ExamItem = React.lazy(() => import("./components/ExamItem").then(m => ({ default: m.ExamItem })));
const SubmissionsView = React.lazy(() => import("./components/SubmissionsView").then(m => ({ default: m.SubmissionsView })));
const AboutView = React.lazy(() => import("./components/AboutView").then(m => ({ default: m.AboutView })));

import { auth, db, storage, signInWithGoogle, logout, createExam, updateExam, deleteExam, createSubmission, updateSubmission, deleteSubmission, handleFirestoreError, OperationType, testConnection } from "./firebase";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { cn, fileToBase64, fixHtml2CanvasOklch } from "./lib/utils";
import { Exam, Submission, AppFeature, EvaluationQuestion } from "./types";
import { storeFile, getFileUrl, deleteFile, clearAllFiles, getFileBlob } from "./lib/offline-storage";
import { NativeStorageConfig, requestNativeFolder, verifyPermission, saveFileToNative, getFileFromNative, isRunningInIframe, isNativeStorageSupported } from "./lib/native-fs";

// --- Utils ---

const validateFile = async (file: File, allowedTypes: string[]): Promise<string | null> => {
  if (!file) return "No file selected.";
  
  const isAllowed = allowedTypes.some(type => {
    if (type === '*/*') return true;
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.replace('/*', ''));
    }
    const ext = "." + file.name.split('.').pop()?.toLowerCase();
    return file.type === type || ext === type.toLowerCase();
  });

  if (!isAllowed) {
    return `Unsupported file type: ${file.name}. Please upload ${allowedTypes.join(' or ')} files.`;
  }

  if (file.size === 0) {
    return `File "${file.name}" appears to be empty or corrupted.`;
  }

  // Lightweight PDF Validation
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    // Only check if it's not empty, heavy metadata check happens later in main flow
    if (file.size < 10) {
      return `The file "${file.name}" appears to be invalid or empty.`;
    }
  }

  return null;
};

const getPdfInfo = async (file: File, extractFirstPage: boolean = false): Promise<{ pageCount: number; firstPage?: { data: string; mimeType: string } } | null> => {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return null;

  try {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    const result: { pageCount: number; firstPage?: { data: string; mimeType: string } } = {
      pageCount: pdf.numPages
    };

    if (extractFirstPage && pdf.numPages > 0) {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context!, viewport, canvas }).promise;
      const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      result.firstPage = { data: base64, mimeType: 'image/jpeg' };
    }

    return result;
  } catch (error) {
    console.error("PDF Processing Error:", error);
    throw new Error(`The file "${file.name}" is not a valid PDF or is corrupted.`);
  }
};

const getPdfMetadata = async (file: File) => {
  const info = await getPdfInfo(file, false);
  return info;
};

const getFirstPageAsImage = async (file: File): Promise<{ data: string; mimeType: string }> => {
  const isImage = file.type.startsWith('image/') || 
                 /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);

  if (isImage) {
    const b64 = await fileToBase64(file);
    if (!b64.mimeType.startsWith('image/')) {
      b64.mimeType = 'image/jpeg'; 
    }
    return b64;
  }

  const info = await getPdfInfo(file, true);
  if (info?.firstPage) return info.firstPage;
  
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
  
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        console.error("Upload Error:", error);
        reject(new Error(`Failed to upload "${file.name}": ${error.message}`));
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
};

const fileDataCache = new Map<string, { data: string; mimeType: string }>();

const fetchFileData = async (url: string, retries: number = 2): Promise<{ data: string; mimeType: string }> => {
  if (fileDataCache.has(url)) return fileDataCache.get(url)!;

  try {
    // 0. Check Native Storage (Absolute User Ownership)
    const nativeConfigJson = localStorage.getItem("grademaster_native_config");
    if (nativeConfigJson) {
      try {
        const config = JSON.parse(nativeConfigJson);
        if (config.enabled && config.folderName) {
           // We need to re-verify permission or handle it via a persistent handle if possible
           // For now, if we have a match in the local IDB, we use it, but this is where 
           // we'd check the native FS if we had a persistent handle.
           // Since handles are not easily serializable to strings, we rely on the 
           // session-based handle stored in the App state below.
        }
      } catch {}
    }

    // 1. Check Local Cache First (IndexedDB)
    try {
      const cachedBlob = await getFileBlob(url);
      if (cachedBlob) {
        console.log("Loading from local cache:", url);
        const result: { data: string; mimeType: string } = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = (reader.result as string).split(",")[1];
            resolve({ data: base64String, mimeType: cachedBlob.type });
          };
          reader.onerror = reject;
          reader.readAsDataURL(cachedBlob);
        });
        fileDataCache.set(url, result);
        return result;
      }
    } catch (cacheErr) {
      console.warn("Local cache access error:", cacheErr);
    }

    if (url.startsWith('data:')) {
      const parts = url.split(",");
      const mimePart = url.split(":")[1]?.split(";")[0];
      const res = { data: parts[1], mimeType: mimePart };
      fileDataCache.set(url, res);
      return res;
    }
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed for ${url}, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchFileData(url, retries - 1);
    }
    throw error;
  }
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ 
    isOpen: boolean; 
    type: 'exam' | 'submission'; 
    id: string | string[]; 
    title: string 
  }>({ isOpen: false, type: 'exam', id: '', title: '' });
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
  
  const reportRef = useRef<HTMLDivElement>(null);
  const bulkExportRef = useRef<HTMLDivElement>(null);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nativeFolderHandle, setNativeFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isNativeStorageEnabled, setIsNativeStorageEnabled] = useState(false);
  const [isLocalCacheEnabled, setIsLocalCacheEnabled] = useState<boolean | null>(() => {
    const saved = localStorage.getItem("grademaster_local_cache");
    return saved !== null ? saved === "true" : null;
  });

  const [browserPermissions, setBrowserPermissions] = useState<{
    camera: PermissionState | 'not-supported' | 'unknown';
    storage: 'native-active' | 'inactive';
  }>({
    camera: 'unknown',
    storage: 'inactive'
  });

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem("grademaster_welcome_complete") !== "true";
  });

  useEffect(() => {
    // Check initial permissions
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any }).then(status => {
        setBrowserPermissions(prev => ({ ...prev, camera: status.state }));
        status.onchange = () => {
          setBrowserPermissions(prev => ({ ...prev, camera: status.state }));
        };
      }).catch(() => {
        setBrowserPermissions(prev => ({ ...prev, camera: 'not-supported' }));
      });
    }

    const nativeEnabled = localStorage.getItem("grademaster_native_enabled") === "true";
    if (nativeEnabled) {
      setBrowserPermissions(prev => ({ ...prev, storage: 'native-active' }));
      setIsNativeStorageEnabled(true);
    }
  }, []);

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
      
      // If we are in guest mode, don't let Firebase auth override it automatically
      // unless we specifically want to switch.
      const isGuest = localStorage.getItem("grademaster_is_guest") === "true";
      if (isGuest) {
        const guestUser = {
          uid: "guest_session",
          displayName: "Guest Educator",
          email: "guest@grademaster.local",
          photoURL: null,
          isAnonymous: true
        };
        setUser(guestUser as any);
        setLoading(false);
        return;
      }

      setUser(u);
      setLoading(false);
      if (u) {
        testConnection().catch(e => console.error("Test connection failed:", e));
      }
    });

    // Handle guest mode explicitly on mount as well to ensure data loading
    const isGuest = localStorage.getItem("grademaster_is_guest") === "true";
    if (isGuest) {
      const localExamsRaw = JSON.parse(localStorage.getItem("grademaster_exams") || "[]");
      const localSubmissionsRaw = JSON.parse(localStorage.getItem("grademaster_submissions") || "[]");
      
      const refreshUrls = async () => {
        const enrichedExams = await Promise.all(localExamsRaw.map(async (ex: any) => {
          try {
            const qpUrl = ex.questionPaperUrl.startsWith("blob:") || ex.questionPaperUrl.startsWith("local_") ? await getFileUrl(ex.id + "_qp") : ex.questionPaperUrl;
            const msUrl = ex.markingSchemeUrl.startsWith("blob:") || ex.markingSchemeUrl.startsWith("local_") ? await getFileUrl(ex.id + "_ms") : ex.markingSchemeUrl;
            return { ...ex, questionPaperUrl: qpUrl, markingSchemeUrl: msUrl };
          } catch (e) {
            return ex;
          }
        }));

        const enrichedSubmissions = await Promise.all(localSubmissionsRaw.map(async (sub: any) => {
          try {
            const bookletUrl = sub.bookletUrl.startsWith("blob:") || sub.bookletUrl.startsWith("local_") ? await getFileUrl(sub.id + "_booklet") : sub.bookletUrl;
            return { ...sub, bookletUrl };
          } catch (e) {
            return sub;
          }
        }));

        setExams(enrichedExams);
        setSubmissions(enrichedSubmissions);
      };

      refreshUrls();
    }

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
    if (!user || user.uid === "guest_session") return;
    const q = query(collection(db, "exams"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExams(snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt
        } as Exam;
      }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "exams");
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || user.uid === "guest_session") return;
    const q = query(collection(db, "submissions"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt
        } as Submission;
      }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "submissions");
    });
    return unsubscribe;
  }, [user]);

  const handleLogout = async () => {
    if (user?.uid === "guest_session") {
      setUser(null);
      localStorage.removeItem("grademaster_is_guest");
      localStorage.removeItem("grademaster_exams");
      localStorage.removeItem("grademaster_submissions");
      clearAllFiles();
    } else {
      logout();
    }
  };

  const handleEnableNativeStorage = async () => {
    if (!isNativeStorageSupported()) {
      showToast("Browser does not support Native File System API.", "error");
      return;
    }

    if (isRunningInIframe()) {
      showToast("In-app preview restricts file access. Please open the app in a new tab to activate Local Vault.", "info");
      return;
    }

    try {
      const handle = await requestNativeFolder();
      if (handle) {
        setNativeFolderHandle(handle);
        setIsNativeStorageEnabled(true);
        localStorage.setItem("grademaster_native_enabled", "true");
        showToast("Native Storage Connected!", "success");
      }
    } catch (err: any) {
      if (err?.name === 'SecurityError' || (err?.message && err.message.includes('sub frames'))) {
         showToast("Access Restricted: Please open the app in a new tab.", "error");
      } else {
         showToast("Failed to connect folder.", "error");
      }
    }
  };

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

    const qpError = await validateFile(newExamQP, ['*/*']);
    const msError = await validateFile(newExamMS, ['*/*']);
    
    if (qpError || msError) {
      showToast(qpError || msError, "error");
      return;
    }

    // Increased limits for "Universal Acceptance"
    const MAX_FILE_SIZE = 100 * 1024 * 1024; 
    if (newExamQP.size > MAX_FILE_SIZE || newExamMS.size > MAX_FILE_SIZE) {
      showToast("Files are too large. Each file must be under 100MB.", "error");
      return;
    }

    setIsUploading(true);
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStatus("Initializing...");
    
    try {
      // 1. Instant Local Storage & Metadata Extraction
      setUploadStatus("Optimizing Local Storage...");
      const [qpMeta, msMeta] = await Promise.all([
        getPdfMetadata(newExamQP),
        getPdfMetadata(newExamMS)
      ]);

      // Generate local fallback IDs
      const localQpKey = `local_qp_${Date.now()}`;
      const localMsKey = `local_ms_${Date.now()}`;

      // Save to IndexedDB (Instant)
      await Promise.all([
        storeFile(localQpKey, newExamQP),
        storeFile(localMsKey, newExamMS)
      ]);

      // Save to Native Folder if authorized (True User ownership)
      if (isNativeStorageEnabled && nativeFolderHandle) {
        try {
          const hasPermission = await verifyPermission(nativeFolderHandle);
          if (hasPermission) {
            await Promise.all([
              saveFileToNative(nativeFolderHandle, `Exam_${Date.now()}_QP_${newExamQP.name}`, newExamQP),
              saveFileToNative(nativeFolderHandle, `Exam_${Date.now()}_MS_${newExamMS.name}`, newExamMS)
            ]);
          }
        } catch (e) {
          console.warn("Native Save Failed:", e);
        }
      }

      setUploadStatus("Finalizing...");
      
      const examData = {
        uid: user.uid,
        title: newExamTitle,
        questionPaperUrl: localQpKey, // Temporary local key
        markingSchemeUrl: localMsKey, // Temporary local key
        studentList: newExamStudentList.split('\n').map(s => s.trim()).filter(s => s !== ""),
        qpPageCount: qpMeta?.pageCount || 0,
        msPageCount: msMeta?.pageCount || 0,
        syncStatus: (user.uid === "guest_session" ? "ready" : "syncing") as any,
      };

      let newExamId = "";
      if (user.uid === "guest_session") {
        newExamId = "local_" + Math.random().toString(36).substring(2, 9);
        const newExam = { id: newExamId, ...examData, createdAt: new Date().toISOString() };
        setExams(prev => {
          const updated = [...prev, newExam];
          localStorage.setItem("grademaster_exams", JSON.stringify(updated));
          return updated;
        });
      } else {
        const docRef = await createExam(examData as any);
        newExamId = docRef.id;

        // Background Upload Flow
        (async () => {
          try {
            console.log("Background upload starting for:", newExamId);
            const [finalQpUrl, finalMsUrl] = await Promise.all([
              uploadFile(newExamQP, `exams/${user.uid}/qp`),
              uploadFile(newExamMS, `exams/${user.uid}/ms`)
            ]);

            // Map final URL to local file in IDB for instant reload
            await Promise.all([
              storeFile(finalQpUrl, newExamQP),
              storeFile(finalMsUrl, newExamMS)
            ]);

            await updateExam(newExamId, {
              questionPaperUrl: finalQpUrl,
              markingSchemeUrl: finalMsUrl,
              syncStatus: "ready"
            });
            console.log("Sync complete for exam:", newExamId);
          } catch (e) {
            console.error("Sync failed for exam:", newExamId, e);
          }
        })();
      }
      
      setIsCreatingExam(false);
      setNewExamTitle("");
      setNewExamQP(null);
      setNewExamMS(null);
      setNewExamStudentList("");
      showToast(user.uid === "guest_session" ? "Exam Created!" : "Exam Created and Syncing...", "success");
    } catch (error: any) {
      console.error("Create Exam Error:", error);
      let message = "Failed to create exam. ";
      
      if (error.message?.includes("corrupted") || error.message?.includes("not a valid image")) {
        message += "One of the files appears to be corrupted or is not a valid PDF.";
      } else if (error.message?.includes("quota") || error.message?.includes("limit")) {
        message += "This might be due to storage limits or document size limits.";
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
      setIsSubmitting(false);
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
    if (!selectedExamId || !newBooklet) {
      showToast("Please provide a booklet.", "error");
      return;
    }

    const bookletError = await validateFile(newBooklet, ['*/*']);
    if (bookletError) { showToast(bookletError, "error"); return; }

    const MAX_FILE_SIZE = 100 * 1024 * 1024; 
    if (newBooklet.size > MAX_FILE_SIZE) {
      showToast("Booklet file is too large (max 100MB).", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus("Initializing...");
    
    try {
      // 1. Instant Processing
      setUploadStatus("Processing Local Data...");
      const localBookletKey = `local_sub_${Date.now()}`;
      
      const [bookletInfo] = await Promise.all([
        getPdfInfo(newBooklet, !newStudentName),
        storeFile(localBookletKey, newBooklet),
        (isNativeStorageEnabled && nativeFolderHandle) ? 
          verifyPermission(nativeFolderHandle).then(has => has && saveFileToNative(nativeFolderHandle, `Submission_${Date.now()}_${newBooklet.name}`, newBooklet)) : 
          Promise.resolve()
      ]);

      const bookletDataForAI = bookletInfo?.firstPage || null;
      let finalName = newStudentName || newBooklet.name.replace(/\.[^/.]+$/, "").replace(/[_]/g, " ");

      // 2. Optimistic Entry
      const submissionData = {
        uid: user!.uid,
        examId: selectedExamId,
        studentName: finalName,
        bookletUrl: localBookletKey,
        status: "pending" as const,
        pageCount: bookletInfo?.pageCount || 0,
        createdAt: serverTimestamp(),
        syncStatus: user!.uid === "guest_session" ? "ready" : "syncing"
      };

      let subId = "";
      if (user!.uid === "guest_session") {
        subId = "local_sub_" + Math.random().toString(36).substring(2, 9);
        const newSub = { id: subId, ...submissionData, createdAt: new Date().toISOString() } as any;
        setSubmissions(prev => {
          const updated = [...prev, newSub];
          localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
          return updated;
        });
      } else {
        const docRef = await createSubmission(submissionData as any);
        subId = docRef.id;

        // Background Upload & Sync
        (async () => {
          try {
            console.log("Background upload starting for submission:", subId);
            const finalUrl = await uploadFile(newBooklet, `submissions/${user!.uid}/${selectedExamId}`);
            
            // Sync to local IDB for instant access
            await storeFile(finalUrl, newBooklet);

            await updateSubmission(subId, {
              bookletUrl: finalUrl,
              syncStatus: "ready"
            });
            console.log("Background sync complete for submission:", subId);
          } catch (e) {
            console.error("Background sync failed for submission:", subId, e);
          }
        })();
      }

      // 3. Name Refinement (Optional, Background)
      if (!newStudentName && bookletDataForAI) {
        (async () => {
          try {
            const aiDetails = await extractStudentDetails(bookletDataForAI);
            if (aiDetails.studentName) {
              if (user!.uid === "guest_session") {
                setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, studentName: aiDetails.studentName } : s));
              } else {
                await updateSubmission(subId, { studentName: aiDetails.studentName });
              }
            }
          } catch (e) { console.warn("AI Name Extraction Failed", e); }
        })();
      }

      setIsAddingSubmission(false);
      setNewStudentName("");
      setNewBooklet(null);
      showToast(user!.uid === "guest_session" ? "Submission Added!" : "Submission Added & Syncing...", "success");
    } catch (error: any) {
      console.error("Add Submission Error:", error);
      showToast(error.message || "Failed to add submission.", "error");
    } finally {
      setIsUploading(false);
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

    try {
      const uploadSingleFile = async (file: File) => {
        const fileError = await validateFile(file, ['*/*']);
        if (fileError) {
          console.warn(`Skipping ${file.name}: ${fileError}`);
          failCount++;
          return;
        }

        const MAX_FILE_SIZE = 150 * 1024 * 1024; // High limit to ensure everything is accepted
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`Skipping ${file.name}: File is too large. Max 150MB.`);
          failCount++;
          return;
        }

        // Faster local processing
        const tempStudentName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").replace(/-/g, " ");
        const localKey = `local_bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Parallelize IDB save and metadata check
        const [pdfMeta, nativeRes] = await Promise.all([
          getPdfMetadata(file),
          storeFile(localKey, file),
          (isNativeStorageEnabled && nativeFolderHandle) ? 
            verifyPermission(nativeFolderHandle).then(has => has && saveFileToNative(nativeFolderHandle, `Bulk_${Date.now()}_${file.name}`, file)) : 
            Promise.resolve()
        ]);
        
        const submissionData = {
          uid: user.uid,
          examId: selectedExamId,
          studentName: tempStudentName,
          bookletUrl: localKey,
          status: "pending" as const,
          pageCount: pdfMeta?.pageCount || 0,
          createdAt: serverTimestamp(),
          syncStatus: user.uid === "guest_session" ? "ready" : "syncing"
        };

        let currentSubId = "";
        if (user.uid === "guest_session") {
          currentSubId = "local_sub_" + Math.random().toString(36).substring(2, 9);
          const newSub = { id: currentSubId, ...submissionData, createdAt: new Date().toISOString() } as any;
          setSubmissions(prev => {
            const updated = [...prev, newSub];
            localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
            return updated;
          });
          successCount++;
        } else {
          const newDoc = await createSubmission(submissionData as any);
          currentSubId = newDoc.id;
          successCount++;

          // Background Cloud Sync for each file
          (async () => {
            try {
              const finalUrl = await uploadFile(file, `submissions/${user.uid}/${selectedExamId}`);
              await storeFile(finalUrl, file); // Map final URL to local file
              await updateSubmission(currentSubId, {
                bookletUrl: finalUrl,
                syncStatus: "ready"
              });
            } catch (syncErr) {
              console.error("Bulk sync error for sub:", currentSubId, syncErr);
            }
          })();
        }

        // Background AI scan for names if requested
        if (useAIForBulkNames) {
          (async () => {
            try {
              const firstPage = await getFirstPageAsImage(file);
              const details = await extractStudentDetails(firstPage);
              if (details.studentName) {
                if (user.uid === "guest_session") {
                  setSubmissions(prev => prev.map(s => s.id === currentSubId ? { ...s, studentName: details.studentName } : s));
                } else {
                  await updateSubmission(currentSubId, { studentName: details.studentName });
                }
              }
            } catch (err) { /* silent fail for background scan */ }
          })();
        }
      };

      // Process with concurrency limit to avoid freezing the browser
      await runWithConcurrency(bulkFiles, 5, async (file) => {
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

  const handleEvaluate = async (submission: Submission, silent: boolean = false) => {
    // We can evaluate offline if we have the simulation ready
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
      
      const updateData = {
        status: "evaluated" as const,
        totalMarks: result.totalMarks,
        maxMarks: result.maxMarks,
        evaluationData: { questions: result.questions }
      };

      if (user?.uid === "guest_session") {
        setSubmissions(prev => {
          const updated = prev.map(s => s.id === submission.id ? { ...s, ...updateData } : s);
          localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
          return updated;
        });
      } else {
        await updateSubmission(submission.id!, updateData);
      }
      
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
    if (!isOnline) {
      showToast("Cannot start bulk evaluation while offline.", "error");
      return;
    }
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

      await runWithConcurrency(pending, 4, async (submission) => {
        try {
          // Fetch only the student's unique booklet data
          const booklet = await fetchFileData(submission.bookletUrl);
          
          console.log(`Starting AI evaluation for ${submission.studentName}...`);
          const result = await evaluateExam(qp, ms, booklet);
          
          const updateData = {
            status: "evaluated" as const,
            totalMarks: result.totalMarks,
            maxMarks: result.maxMarks,
            evaluationData: { questions: result.questions }
          };

          if (user?.uid === "guest_session") {
            setSubmissions(prev => {
              const updated = prev.map(s => s.id === submission.id ? { ...s, ...updateData } : s);
              localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
              return updated;
            });
          } else {
            await updateSubmission(submission.id!, updateData);
          }
          
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
    
    setIsSubmitting(true);
    try {
      const updateData = {
        title: editingExam.title,
        studentList: editingExam.studentList
      };

      if (user?.uid === "guest_session") {
        setExams(prev => {
          const updated = prev.map(ex => ex.id === editingExam.id ? { ...ex, ...updateData } : ex);
          localStorage.setItem("grademaster_exams", JSON.stringify(updated));
          return updated;
        });
      } else {
        await updateExam(editingExam.id, updateData);
      }
      setEditingExam(null);
      showToast("Exam updated successfully.", "success");
    } catch (error: any) {
      console.error("Update Exam Error:", error);
      showToast("Failed to update exam.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExam = async (id: string, title?: string) => {
    if (!deleteModal.isOpen && !id) return;
    
    // If called directly without modal, show modal first
    if (!deleteModal.isOpen) {
      setDeleteModal({ isOpen: true, type: 'exam', id, title: title || "this exam" });
      return;
    }

    setIsSubmitting(true);
    setDeleteModal(prev => ({ ...prev, isOpen: false }));
    
    try {
      // Delete associated submissions first
      const associatedSubmissions = submissions.filter(s => s.examId === id);
      
      if (user?.uid === "guest_session") {
        const remainingSubmissions = submissions.filter(s => s.examId !== id);
        setSubmissions(remainingSubmissions);
        localStorage.setItem("grademaster_submissions", JSON.stringify(remainingSubmissions));

        const remainingExams = exams.filter(ex => ex.id !== id);
        setExams(remainingExams);
        localStorage.setItem("grademaster_exams", JSON.stringify(remainingExams));

        // Cleanup local files
        deleteFile(id + "_qp");
        deleteFile(id + "_ms");
        associatedSubmissions.forEach(s => deleteFile(s.id + "_booklet"));
      } else {
        // Delete associated submissions in parallel
        await Promise.all(associatedSubmissions.map(sub => sub.id ? deleteSubmission(sub.id) : Promise.resolve()));
        await deleteExam(id);
      }
      
      if (selectedExamId === id) setSelectedExamId(null);
      showToast("Exam and all associated submissions deleted successfully.", "success");
    } catch (error: any) {
      console.error("Delete Exam Error:", error);
      showToast("Failed to delete exam.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmission = async (id: string | string[], name?: string) => {
    if (!deleteModal.isOpen && (!id || (Array.isArray(id) && id.length === 0))) return;

    if (!deleteModal.isOpen) {
      const isBulk = Array.isArray(id);
      setDeleteModal({ 
        isOpen: true, 
        type: 'submission', 
        id, 
        title: isBulk ? `${id.length} selected submissions` : (name || "this submission") 
      });
      return;
    }

    setIsSubmitting(true);
    setDeleteModal(prev => ({ ...prev, isOpen: false }));

    try {
      const idsToDelete = Array.isArray(id) ? id : [id];
      
      if (user?.uid === "guest_session") {
        const remainingSubmissions = submissions.filter(s => !idsToDelete.includes(s.id!));
        setSubmissions(remainingSubmissions);
        localStorage.setItem("grademaster_submissions", JSON.stringify(remainingSubmissions));
        idsToDelete.forEach(sid => deleteFile(sid + "_booklet"));
      } else {
        await Promise.all(idsToDelete.map(sid => deleteSubmission(sid)));
      }
      showToast(`${idsToDelete.length} ${idsToDelete.length === 1 ? 'submission' : 'submissions'} deleted`, "success");
    } catch (error) {
      showToast("Failed to delete submission(s)", "error");
    } finally {
      setIsSubmitting(false);
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

  const handleBulkStatusUpdate = async (ids: string[], status: "pending" | "evaluated") => {
    setIsSubmitting(true);
    let success = 0;
    try {
      if (user?.uid === "guest_session") {
        setSubmissions(prev => {
          const updated = prev.map(s => ids.includes(s.id!) ? { ...s, status } : s);
          localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
          return updated;
        });
        success = ids.length;
      } else {
        await Promise.all(ids.map(id => updateSubmission(id, { status })));
        success = ids.length;
      }
      showToast(`Successfully updated ${success} submissions to ${status}.`, "success");
    } catch (err: any) {
      console.error("Bulk Status Update Error:", err);
      showToast("Failed to update some submissions.", "error");
    } finally {
      setIsSubmitting(false);
    }
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
              GradeMaster
            </h3>
            <div className="flex items-center justify-center gap-3">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Logging In</p>
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
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-6 overflow-hidden relative">
        {/* Background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-md w-full relative z-10"
        >
          <div className="text-center mb-12">
            <motion.div 
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
              className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-[0_20px_50px_rgba(37,99,235,0.3)] relative group cursor-default"
            >
              <GraduationCap className="w-12 h-12 text-white" />
              <div className="absolute inset-0 bg-white/20 rounded-[32px] opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
            <h1 className="text-5xl font-display font-black text-white mb-4 tracking-tighter italic">GradeMaster</h1>
            <div className="flex items-center justify-center gap-3">
               <div className="h-px w-8 bg-slate-800" />
               <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.4em]">Grading Platform</p>
               <div className="h-px w-8 bg-slate-800" />
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/60 rounded-[48px] p-10 space-y-8 shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative overflow-hidden technical-border">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            
            <div className="space-y-2 text-center">
              <p className="text-slate-400 font-medium leading-relaxed">
                Log in to access your student booklets and grading.
              </p>
            </div>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl flex items-start gap-4 text-rose-400 text-xs font-bold leading-relaxed"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="uppercase tracking-widest text-[10px]">Error</p>
                  <p className="font-medium opacity-80">{authError}</p>
                </div>
              </motion.div>
            )}

            <button
              onClick={async () => {
                if (isSigningIn) return;
                setIsSigningIn(true);
                setAuthError(null);
                try {
                  await signInWithGoogle();
                } catch (err: any) {
                  console.error(err);
                  if (err.code === 'auth/cancelled-popup-request') {
                    setAuthError("A sign-in request is already pending.");
                  } else if (err.code === 'auth/popup-closed-by-user') {
                    setAuthError("Sign-in process interrupted.");
                  } else if (err.code === 'auth/blocked-by-popup-blocker') {
                    setAuthError("Popup blocked. Please adjust browser settings.");
                  } else {
                    setAuthError(err.message || "Credential verification failed.");
                  }
                } finally {
                  setIsSigningIn(false);
                }
              }}
              disabled={isSigningIn}
              className="w-full h-20 bg-white text-black font-black uppercase tracking-[0.2em] text-[12px] rounded-[28px] flex items-center justify-center gap-4 hover:bg-slate-100 transition-all active:scale-[0.98] shadow-2xl shadow-blue-500/5 disabled:opacity-50 disabled:cursor-not-allowed group mb-4"
            >
              {isSigningIn ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <div className="w-8 h-8 bg-slate-950 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <LogIn className="w-4 h-4 text-white" />
                  </div>
                  <span>Log in with Google</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                // Set a mock user for guest mode
                const guestUser = {
                  uid: "guest_" + Math.random().toString(36).substring(2, 9),
                  displayName: "Guest Educator",
                  email: "guest@grademaster.local",
                  photoURL: null,
                  isAnonymous: true
                };
                setUser(guestUser as any);
                setLoading(false);
                localStorage.setItem("grademaster_is_guest", "true");
              }}
              className="w-full py-4 border-2 border-slate-800 text-slate-400 font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-800 hover:text-white transition-all active:scale-[0.98]"
            >
              Continue as Guest (Offline Mode)
            </button>
            
            <div className="pt-4 flex flex-col items-center gap-4">
               <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-500/50" />
                  <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Secure Connection</p>
               </div>
               <p className="text-[10px] text-center text-slate-700 font-mono uppercase tracking-tighter max-w-[200px]">
                 Secure login for academic use.
               </p>
            </div>
          </div>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-12 text-center text-slate-600 font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            © 2024 GradeMaster
          </motion.p>
        </motion.div>
      </div>
    );
  }



  return (
    <div className="h-screen w-full flex bg-slate-950 overflow-hidden font-sans text-slate-200">
      <AnimatePresence>
        {(!isOnline || user.uid === "guest_session") && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className={cn(
              "fixed top-0 left-0 right-0 z-[200] text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center flex items-center justify-center gap-2",
              user.uid === "guest_session" ? "bg-blue-600" : "bg-orange-600"
            )}
          >
            <AlertCircle className="w-3 h-3" />
            {user.uid === "guest_session" 
              ? "Guest Mode: Data saved locally. AI Grading Simulated if offline." 
              : "Offline Mode: AI Grading & Uploads Suspended. Viewing cached data."}
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
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[45] lg:hidden"
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
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed lg:relative w-80 h-full bg-slate-900/90 backdrop-blur-3xl border-r border-slate-800 flex flex-col z-50 shadow-2xl lg:shadow-none"
          >
            <div className="p-8 pb-4 flex items-center justify-between mb-8">
              <div className="flex items-center gap-4 group cursor-default">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/30 group-hover:scale-110 transition-transform duration-500">
                  <GraduationCap className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-display font-black tracking-tight text-white italic leading-tight">GradeMaster</h1>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Admin Panel</p>
                </div>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-2.5 hover:bg-slate-800 rounded-xl lg:hidden transition-colors"
                aria-label="Close Sidebar"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
              {[
                { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Overview of grading' },
                { id: 'exams', icon: BookOpen, label: 'Exams', desc: 'Questions and schemes' },
                { id: 'submissions', icon: FileCheck, label: 'Submissions', desc: 'Student booklets' },
                { id: 'students', icon: Users, label: 'Roster', desc: 'Manage students' },
                { id: 'settings', icon: Settings, label: 'Settings', desc: 'Storage & Account' },
                { id: 'about', icon: Info, label: 'Help', desc: 'System information' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => { 
                    setActiveFeature(item.id as any); 
                    setSelectedExamId(null); 
                    setSelectedSubmissionId(null); 
                    if (window.innerWidth < 1024) setSidebarOpen(false); 
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group hover:translate-x-1 outline-none",
                    activeFeature === item.id 
                      ? "bg-blue-600/10 text-blue-400 ring-1 ring-blue-500/20 shadow-inner" 
                      : "text-slate-500 hover:text-slate-200 hover:bg-slate-800/50"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300",
                    activeFeature === item.id ? "bg-blue-600/20 text-blue-400" : "bg-slate-800 text-slate-600 group-hover:text-slate-400"
                  )}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-bold tracking-tight">{item.label}</span>
                    <span className="text-[10px] font-medium text-slate-600 truncate group-hover:text-slate-500 transition-colors uppercase tracking-wider">{item.desc}</span>
                  </div>
                  {activeFeature === item.id && (
                    <motion.div 
                      layoutId="active-nav-glow"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
                    />
                  )}
                </button>
              ))}
            </nav>

            <div className="p-8 border-t border-slate-800 space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/30 border border-slate-800/50 group hover:border-slate-700 transition-colors">
                <div className="relative shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-12 h-12 rounded-xl border-2 border-slate-700 ring-2 ring-transparent group-hover:ring-blue-500/20 transition-all" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl border-2 border-slate-700 bg-blue-600 flex items-center justify-center text-white font-black text-lg uppercase">
                      {(user.displayName || user.email || "?").charAt(0)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate text-white uppercase tracking-tight">{user.displayName}</p>
                  <p className="text-[10px] font-mono text-slate-500 truncate uppercase mt-0.5 tracking-tighter">Educator</p>
                </div>
              </div>
              
              <button 
                onClick={handleLogout}
                className="w-full py-4 px-6 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-2xl transition-all duration-300 flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-xs font-black uppercase tracking-widest">Logout</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 h-full flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-24 sticky top-0 border-b border-slate-800/60 flex items-center px-6 sm:px-10 gap-3 sm:gap-6 bg-slate-950/40 backdrop-blur-3xl z-40 shrink-0">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-3 bg-slate-900/50 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white border border-slate-800/50 hover:border-blue-500/30"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="h-4 w-px bg-slate-800/60 hidden sm:block" />
          <div className="flex-1 flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-bold min-w-0">
            <div className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 text-slate-500 uppercase tracking-widest text-[10px] shrink-0">{activeFeature}</div>
            
            <AnimatePresence mode="popLayout">
              {selectedExamId && (
                <motion.div 
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex items-center gap-2 sm:gap-4 min-w-0"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" />
                  <span className="text-white truncate font-display italic text-base">{exams.find(e => e.id === selectedExamId)?.title}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
              {selectedSubmissionId && (
                <motion.div 
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex items-center gap-2 sm:gap-4 min-w-0"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" />
                  <span className="text-blue-400 truncate tracking-tight">{submissions.find(s => s.id === selectedSubmissionId)?.studentName}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col items-end mr-4">
               <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
               <span className={cn(
                 "text-[10px] font-mono uppercase tracking-widest leading-none mt-1",
                 isOnline ? "text-emerald-400" : "text-rose-400"
               )}>
                 Status: {isOnline ? "Online" : "Offline"}
               </span>
            </div>
            
            {error && (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs font-black uppercase tracking-tight"
              >
                <Cpu className="w-4 h-4 animate-pulse" />
                Error
                <button onClick={() => setError(null)} className="ml-2 hover:text-white p-1 rounded-md hover:bg-rose-500/20 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
            
            <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors cursor-pointer group">
              <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </div>
          </div>
        </header>

        {/* Views */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12">
          <React.Suspense fallback={
            <div className="h-full w-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          }>
            <AnimatePresence mode="wait">
              {activeFeature === "dashboard" && (
                <DashboardView 
                  stats={dashboardStats} 
                  onNavigate={(feature, examId) => {
                    setActiveFeature(feature);
                    if (examId) setSelectedExamId(examId);
                  }}
                  onLoadSample={async () => {
                    if (!user) return;
                    const tid = showToast("Configuring Evaluation Environment", "loading");
                    try {
                      const samplePdf = "data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvQ291bnQgMSAvS2lkcyBbIDMgMCBSIF0gPj4KZW5kb2JqCjMgMCBvYmoKICA8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1Jlc291cmNlcyA0IDAgUiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmogIDw8ID4+IGVuZG9iago1IDAgb2JqCiAgPDwgL0xlbmd0aCA0NCA+PiBzdHJlYW0KICAwIDAgMCAxIEsgYmYgQlQKICAvRjEgMjQgVGYgMTAwIDcwMCBUZCAoR3JhZGVNYXN0ZXIgRGVtb3EpIFRqIEVUCiAgZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzggMDAwMDAgbiAKMDAwMDAwMDI1OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjM1MgolJUVPRgo=";
                      const examData = {
                        uid: user.uid,
                        title: "Quantum Physics: Wave-Particle Duality Master",
                        questionPaperUrl: samplePdf,
                        markingSchemeUrl: samplePdf,
                        studentList: ["John Doe", "Jane Smith", "Xavier Chen"]
                      };

                      let exam;
                      if (user.uid === "guest_session") {
                        const id = "local_" + Math.random().toString(36).substring(2, 9);
                        exam = { id, ...examData, createdAt: new Date().toISOString() };
                        setExams(prev => {
                          const updated = [...prev, exam];
                          localStorage.setItem("grademaster_exams", JSON.stringify(updated));
                          return updated;
                        });
                      } else {
                        exam = await createExam(examData);
                      }

                      if (exam && exam.id) {
                        const demoSubs = [
                          {
                            studentName: "John Doe",
                            totalMarks: 48,
                            maxMarks: 50,
                            evaluationData: {
                              summary: "Candidate John Doe demonstrated exceptional mastery of Schrödinger's Wave Equation and the Heisenberg Uncertainty Principle. The derivation of the wave function for a particle in a 1D box was mathematically perfect. Minor points were deducted for lack of units in the final kinetic energy calculation.",
                              questions: [
                                {
                                  questionNumber: "1",
                                  transcription: "By applying the time-independent Schrödinger equation, we find that the wave function must be continuous at the boundaries...",
                                  marksAwarded: 10,
                                  maxMarks: 10,
                                  feedback: "Exceptional mathematical rigor. Boundary condition application is precise.",
                                  pageNumber: 1
                                },
                                {
                                  questionNumber: "2",
                                  transcription: "The probability density is given by the square of the amplitude |ψ|²...",
                                  marksAwarded: 10,
                                  maxMarks: 10,
                                  feedback: "Correct interpretation of the Born rule.",
                                  pageNumber: 1
                                }
                              ]
                            }
                          },
                          {
                            studentName: "Jane Smith",
                            totalMarks: 22,
                            maxMarks: 50,
                            evaluationData: {
                              summary: "Jane Smith showed basic understanding but failed to complete the secondary and tertiary sections of the paper. Section 2 was left entirely blank. The concepts that were attempted showed moderate understanding of the photoelectric effect.",
                              questions: [
                                {
                                  questionNumber: "1",
                                  transcription: "Energy is quantized in discrete packets called photons. E = hf...",
                                  marksAwarded: 12,
                                  maxMarks: 15,
                                  feedback: "Good conceptual grasp of photon energy. Failed to derive the work function relationship.",
                                  pageNumber: 1
                                },
                                {
                                  questionNumber: "2",
                                  transcription: "[NO DATA DETECTED - SECTION LEFT BLANK]",
                                  marksAwarded: 0,
                                  maxMarks: 15,
                                  feedback: "Question ignored by student.",
                                  pageNumber: 1
                                }
                              ]
                            }
                          },
                          {
                            studentName: "Xavier Chen",
                            totalMarks: 35,
                            maxMarks: 50,
                            evaluationData: {
                              summary: "Xavier has a good grasp of concepts but struggles with algebraic manipulation. Several mathematical errors led to incorrect final values despite correct initial formulas.",
                              questions: [
                                {
                                  questionNumber: "1",
                                  transcription: "λ = h/p. For an electron moving at 0.1c...",
                                  marksAwarded: 15,
                                  maxMarks: 20,
                                  feedback: "Formula is correct. Numerical error in calculating momentum leads to incorrect wavelength.",
                                  pageNumber: 1
                                },
                                {
                                  questionNumber: "2",
                                  transcription: "The Compton shift is given by Δλ = (h/mc)(1-cosθ)...",
                                  marksAwarded: 20,
                                  maxMarks: 20,
                                  feedback: "Perfect derivation and calculation.",
                                  pageNumber: 1
                                }
                              ]
                            }
                          }
                        ];

                        for (const sub of demoSubs) {
                          const subData = {
                            uid: user.uid,
                            examId: exam.id,
                            bookletUrl: samplePdf,
                            status: 'evaluated' as const,
                            ...sub
                          };
                          if (user.uid === "guest_session") {
                            const sid = "local_sub_" + Math.random().toString(36).substring(2, 9);
                            setSubmissions(prev => {
                              const updated = [...prev, { id: sid, ...subData, createdAt: new Date().toISOString() }];
                              localStorage.setItem("grademaster_submissions", JSON.stringify(updated));
                              return updated;
                            });
                          } else {
                            await createSubmission(subData);
                          }
                        }
                      }
                      removeToast(tid);
                      showToast("Physics Evaluation Master Reflected.", "success");
                    } catch (e) {
                      removeToast(tid);
                      showToast("Failed to initialize sample data.", "error");
                      console.error(e);
                    }
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
                  {sortedExams.map(exam => (
                    <ExamItem 
                      key={exam.id} 
                      exam={exam} 
                      onSelect={() => { setSelectedExamId(exam.id!); setActiveFeature("submissions"); }}
                      onEdit={() => setEditingExam(exam)}
                      onDelete={() => handleDeleteExam(exam.id!, exam.title)}
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
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0, y: 40 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      className="bg-slate-900 border border-slate-800 rounded-[48px] p-8 sm:p-12 max-w-2xl w-full shadow-[0_20px_100px_rgba(0,0,0,0.8)] max-h-[90vh] overflow-y-auto custom-scrollbar relative technical-border"
                    >
                      <div className="flex items-center justify-between mb-12">
                        <div>
                          <h2 className="text-3xl font-display font-black text-white italic tracking-tighter leading-none">Initialize Exam</h2>
                          <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2">New Assessment Master Creation</p>
                        </div>
                        <button onClick={() => setIsCreatingExam(false)} className="p-4 bg-slate-800/50 border border-slate-700 text-slate-500 hover:text-white rounded-2xl transition-all active:scale-90">
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateExam} className="space-y-10">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500">Security Title / Identifier</label>
                            {newExamTitle && <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest">Valid</span>}
                          </div>
                          <input 
                            required
                            value={newExamTitle}
                            onChange={(e) => setNewExamTitle(e.target.value)}
                            placeholder="e.g. ADV-GRAD-SYS-FINAL-2024"
                            className="w-full bg-slate-950/50 border border-slate-800/60 rounded-[22px] p-6 text-white text-lg font-bold placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all font-display italic tracking-tight"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <FileUpload 
                            label="Document Master (QP)" 
                            onUpload={setNewExamQP} 
                            file={newExamQP} 
                            accept={{ 'image/*': [], 'application/pdf': [], 'application/octet-stream': [], '*': [] }}
                          />
                          <FileUpload 
                            label="Logic Master (MS)" 
                            onUpload={setNewExamMS} 
                            file={newExamMS} 
                            accept={{ 'image/*': [], 'application/pdf': [], 'application/octet-stream': [], '*': [] }}
                          />
                        </div>

                        {newExamQP && newExamMS && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-10"
                          >
                            <div className="space-y-3">
                              <label className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500 px-1">Student Registry (Line-Delimited)</label>
                              <textarea 
                                rows={4}
                                value={newExamStudentList}
                                onChange={(e) => setNewExamStudentList(e.target.value)}
                                placeholder="CANDIDATE-001&#10;CANDIDATE-002&#10;..."
                                className="w-full bg-slate-950/50 border border-slate-800/60 rounded-[28px] p-6 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all font-mono text-sm leading-relaxed"
                              />
                            </div>

                            <button 
                              type="submit"
                              disabled={isSubmitting}
                              className="w-full h-20 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-[12px] rounded-[32px] hover:bg-blue-500 transition-all shadow-[0_20px_50px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-4 active:scale-[0.98] ring-1 ring-white/10"
                            >
                              {isSubmitting ? (
                                <div className="flex items-center gap-3">
                                  <Loader2 className="w-6 h-6 animate-spin" />
                                  <span className="animate-pulse">{uploadStatus || "Committing..."}</span>
                                </div>
                              ) : (
                                <>
                                  <Plus className="w-6 h-6" />
                                  <span>Commit Exam Module</span>
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}

                        {(!newExamQP || !newExamMS) && (
                          <div className="p-10 bg-slate-950/30 border border-dashed border-slate-800 rounded-[32px] text-center group cursor-default">
                             <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                                <Cpu className="w-8 h-8 text-slate-700" />
                             </div>
                             <p className="text-slate-400 font-bold italic mb-2">Incomplete Data Stream</p>
                             <p className="text-slate-600 font-mono text-[10px] uppercase tracking-widest leading-relaxed">Both document and logic master nodes must be linked for system activation.</p>
                          </div>
                        )}
                      </form>
                    </motion.div>
                  </div>
                )}

                {editingExam && (
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0, y: 40 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      className="bg-slate-900 border border-slate-800 rounded-[48px] p-8 sm:p-12 max-w-xl w-full shadow-[0_20px_100px_rgba(0,0,0,0.8)] max-h-[90vh] overflow-y-auto custom-scrollbar relative"
                    >
                      <div className="flex items-center justify-between mb-12">
                        <div>
                          <h2 className="text-3xl font-display font-black text-white italic tracking-tighter leading-none">Modify Exam</h2>
                          <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2">Update Parameters</p>
                        </div>
                        <button onClick={() => setEditingExam(null)} className="p-4 bg-slate-800/50 border border-slate-700 text-slate-500 hover:text-white rounded-2xl transition-all active:scale-90">
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      <form onSubmit={handleUpdateExam} className="space-y-10">
                        <div className="space-y-3">
                          <label className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500 px-1">Security Title / Identifier</label>
                          <input 
                            required
                            value={editingExam.title}
                            onChange={(e) => setEditingExam({ ...editingExam, title: e.target.value })}
                            placeholder="e.g. ADV-GRAD-SYS-FINAL-2024"
                            className="w-full bg-slate-950/50 border border-slate-800/60 rounded-[22px] p-6 text-white text-lg font-bold placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all font-display italic tracking-tight"
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full h-20 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-[12px] rounded-[32px] hover:bg-blue-500 transition-all shadow-[0_20px_50px_rgba(37,99,235,0.2)] active:scale-[0.98] ring-1 ring-white/10"
                        >
                          {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Commit Parameter Changes"}
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
                    onDeleteSubmission={(id) => {
                      if (Array.isArray(id)) {
                        handleDeleteSubmission(id);
                      } else {
                        const sub = submissions.find(s => s.id === id);
                        handleDeleteSubmission(id, sub?.studentName);
                      }
                    }}
                    onBulkStatusUpdate={handleBulkStatusUpdate}
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
                          label="Answer Booklet" 
                          onUpload={setNewBooklet} 
                          file={newBooklet} 
                          accept={{ 'image/*': [], 'application/pdf': [], 'application/octet-stream': [], '*': [] }}
                        />
                        {newBooklet && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <button 
                              type="submit"
                              disabled={isUploading}
                              className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                              {isUploading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  <FileCheck className="w-5 h-5" />
                                  <span>Submit Submission</span>
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
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
                          accept={{ '*/*': [] }}
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
                        {bulkFiles.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <button 
                              type="submit"
                              disabled={isUploading}
                              className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                              {isUploading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-5 h-5" />
                                  <span>Submit All Files ({bulkFiles.length})</span>
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
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
                            placeholder="CANDIDATE-001&#10;CANDIDATE-002&#10;..."
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
                            disabled={isSubmitting}
                            onClick={async () => {
                              const list = newExamStudentList.split('\n').map(s => s.trim()).filter(s => s !== "");
                              setIsSubmitting(true);
                              try {
                                if (user?.uid === "guest_session" && isManagingStudents) {
                                  setExams(prev => {
                                    const updated = prev.map(ex => ex.id === isManagingStudents ? { ...ex, studentList: list } : ex);
                                    localStorage.setItem("grademaster_exams", JSON.stringify(updated));
                                    return updated;
                                  });
                                } else if (isManagingStudents) {
                                  await updateExam(isManagingStudents, { studentList: list });
                                }
                                setIsManagingStudents(null);
                                setNewExamStudentList("");
                                showToast("Roster updated successfully", "success");
                              } catch (e) {
                                showToast("Failed to update roster", "error");
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all flex items-center justify-center gap-2"
                          >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Roster"}
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
                    {(() => {
                      const exam = exams.find(e => e.id === currentSubmission.examId);
                      if (!exam) return null;
                      return (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => window.open(exam.questionPaperUrl, '_blank')}
                            className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-inner"
                            title="View Question Paper"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => window.open(exam.markingSchemeUrl, '_blank')}
                            className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-inner"
                            title="View Marking Scheme"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        </div>
                      );
                    })()}
                    {currentSubmission.status === "evaluated" && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = currentSubmission.bookletUrl;
                            link.download = `Submission_${currentSubmission.studentName}.pdf`;
                            // If it's a data URI or blob, we don't necessarily need target _blank
                            if (!currentSubmission.bookletUrl.startsWith('data:')) {
                              link.target = "_blank";
                            }
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 hover:text-white transition-all border border-slate-800 text-xs sm:text-sm"
                          title="Download Original Booklet"
                        >
                          <FileText className="w-4 h-4 sm:w-5 h-5" />
                          <span className="truncate">Download Original</span>
                        </button>
                        <button 
                          onClick={() => exportPDF()}
                          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all border border-slate-700 text-xs sm:text-sm shadow-xl shadow-blue-500/5"
                        >
                          <Download className="w-4 h-4 sm:w-5 h-5" />
                          <span className="truncate">Export Report</span>
                        </button>
                      </div>
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
                    <div ref={reportRef} className="space-y-12 sm:space-y-16 bg-slate-900/40 border border-slate-800/60 rounded-[48px] p-8 sm:p-14 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-14 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                         <Sparkles className="w-80 h-80" />
                      </div>
                      
                      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-800/80 pb-12 sm:pb-16 gap-8 relative z-10">
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                             <div className="w-1.5 h-12 bg-blue-600 rounded-full" />
                             <div>
                                <h2 className="text-4xl sm:text-5xl font-display font-black text-white italic tracking-tighter leading-none">{currentSubmission.studentName}</h2>
                                <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-3">Grading Report</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="px-4 py-1.5 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center gap-2">
                               <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">Exam</span>
                               <span className="text-sm font-bold text-white italic">{exams.find(e => e.id === currentSubmission.examId)?.title}</span>
                            </div>
                            <div className="px-4 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center gap-2">
                               <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                               <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Graded by AI</span>
                            </div>
                          </div>
                        </div>
                        <div className="md:text-right bg-slate-950/40 p-8 sm:p-0 rounded-[32px] md:bg-transparent border md:border-none border-slate-800/60 shadow-inner md:shadow-none">
                          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600 mb-2">Aggregate Grade</p>
                          <div className="flex flex-col md:items-end">
                            <p className="text-5xl sm:text-7xl font-black text-white tracking-tighter leading-none flex items-baseline gap-2">
                               <span className="text-blue-500">{currentSubmission.totalMarks}</span> 
                               <span className="text-2xl sm:text-3xl text-slate-800 font-mono italic">/</span>
                               <span className="text-2xl sm:text-3xl text-slate-600 font-display italic">{currentSubmission.maxMarks}</span>
                            </p>
                            <div className="flex items-center gap-3 mt-4 md:justify-end">
                               <div className="h-1.5 w-32 bg-slate-800 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(currentSubmission.totalMarks / currentSubmission.maxMarks) * 100}%` }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="h-full bg-blue-500" 
                                  />
                               </div>
                               <p className="text-xl font-display font-black text-blue-400/80 italic">
                                 {((currentSubmission.totalMarks / currentSubmission.maxMarks) * 100).toFixed(1)}%
                               </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-10 relative z-10">
                        <div className="flex items-center justify-between">
                          <h3 className="text-2xl font-display font-black text-white italic flex items-center gap-3">
                            <FileCheck className="w-6 h-6 text-blue-500" />
                            Question Feedback
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                          {currentSubmission.evaluationData?.questions.map((q: EvaluationQuestion, i: number) => (
                            <div key={i} className="group/card p-8 sm:p-10 rounded-[40px] bg-slate-800/20 border border-slate-800/60 hover:border-blue-500/30 transition-all duration-500 backdrop-blur-xl relative overflow-hidden">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10">
                                <div className="flex items-center gap-5">
                                  <div className="w-16 h-16 bg-slate-950 rounded-[22px] border border-slate-800 flex items-center justify-center text-blue-500 font-black text-lg shadow-inner group-hover/card:scale-110 group-hover/card:rotate-3 transition-all duration-500">Q{q.questionNumber}</div>
                                  <div>
                                    <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1">Location</p>
                                    <p className="text-sm font-bold text-white font-display italic">Page {q.pageNumber}</p>
                                  </div>
                                </div>
                                <div className="self-start sm:self-auto px-6 py-3 bg-slate-950 rounded-2xl text-base font-black text-blue-400 border border-slate-800/80 flex items-center gap-3 shadow-inner">
                                  <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-[0.2em] mr-1">Awarded</span>
                                  <span className="text-xl leading-none">{q.marksAwarded}</span>
                                  <span className="text-slate-800 font-mono">/</span>
                                  <span className="text-slate-500 leading-none">{q.maxMarks}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                                <div className="space-y-4">
                                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600 flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                                    Transcription
                                  </div>
                                  <div className="p-6 rounded-[28px] bg-slate-950/40 border border-slate-800/50 min-h-[100px] shadow-inner group-hover/card:bg-slate-950/60 transition-colors">
                                    <p className="text-sm text-slate-400 italic leading-relaxed font-medium">"{q.transcription}"</p>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600 mb-4 flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                                    AI Feedback
                                  </div>
                                  <div className="p-6 rounded-[28px] bg-purple-500/5 border border-purple-500/10 min-h-[100px] shadow-inner group-hover/card:bg-purple-500/10 transition-colors">
                                    <p className="text-sm text-purple-100/80 leading-relaxed font-medium">{q.feedback}</p>
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
                    <p className="text-sm text-slate-500 max-w-xs mx-auto mb-8">This student's booklet is uploaded and ready for the AI to perform the grading process.</p>
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

            {activeFeature === "settings" && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="max-w-4xl mx-auto"
              >
                <div className="mb-10">
                  <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
                  <p className="text-slate-500">Configure your local storage and account preferences.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Device Authorization Status</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                        <div className="p-6 bg-slate-950/40 rounded-[32px] border border-slate-800/50 flex flex-col gap-6 group hover:border-emerald-500/20 transition-all hover:bg-slate-950/60 shadow-xl">
                           <div className="flex items-center justify-between">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${browserPermissions.camera === 'granted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500 group-hover:scale-110'}`}>
                                <Camera className="w-6 h-6" />
                              </div>
                              <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${browserPermissions.camera === 'granted' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/50'}`}>
                                {browserPermissions.camera === 'granted' ? 'Authorized' : 'Restricted'}
                              </div>
                           </div>
                           <div>
                              <p className="text-white font-bold text-lg tracking-tight mb-1">Optical Scanner</p>
                              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em]">Used for real-time booklet capture</p>
                           </div>
                           <div className="pt-2 border-t border-slate-800/50">
                              {browserPermissions.camera !== 'granted' ? (
                                <button 
                                  onClick={async () => {
                                    try {
                                      await navigator.mediaDevices.getUserMedia({ video: true });
                                      showToast("Permission Updated", "success");
                                    } catch {
                                      showToast("Access Denied", "error");
                                    }
                                  }}
                                  className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 flex items-center gap-2 group/btn"
                                >
                                  Grant Authorization <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                                </button>
                              ) : (
                                <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3" /> System Ready
                                </p>
                              )}
                           </div>
                        </div>

                        <div className="p-6 bg-slate-950/40 rounded-[32px] border border-slate-800/50 flex flex-col gap-6 group hover:border-blue-500/20 transition-all hover:bg-slate-950/60 shadow-xl">
                           <div className="flex items-center justify-between">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isNativeStorageEnabled ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-800 text-slate-500 group-hover:scale-110'}`}>
                                <Folders className="w-6 h-6" />
                              </div>
                              <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${isNativeStorageEnabled ? 'bg-blue-500/5 text-blue-500 border-blue-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/50'}`}>
                                {isNativeStorageEnabled ? 'Vault Active' : 'Disconnected'}
                              </div>
                           </div>
                           <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-white font-bold text-lg tracking-tight">Local Storage Vault</p>
                                {isRunningInIframe() && (
                                  <span className="text-[8px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest font-black ring-1 ring-slate-700">Preview Restricted</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em]">Native directory synchronization</p>
                           </div>
                           <div className="pt-2 border-t border-slate-800/50">
                              {!isNativeStorageEnabled ? (
                                <button 
                                  onClick={handleEnableNativeStorage}
                                  className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 flex items-center gap-2 group/btn"
                                >
                                  Link Local Folder <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                                </button>
                              ) : (
                                <p className="text-[10px] font-bold text-blue-500/70 uppercase tracking-widest flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3" /> Sync Connected
                                </p>
                              )}
                           </div>
                        </div>
                    </div>

                    <h4 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Performance Optimizations</h4>
                    <div className="space-y-4">
                       <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800/50 flex items-center justify-between group hover:border-blue-500/30 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                              <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                               <p className="font-bold text-white tracking-tight">Native File System Sync</p>
                               <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Stores files in a folder on your computer</p>
                            </div>
                          </div>
                          {!isNativeStorageEnabled ? (
                            <button 
                              onClick={handleEnableNativeStorage}
                              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all active:scale-95"
                            >
                              Activate
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                               <CheckCircle className="w-4 h-4" /> Active
                            </div>
                          )}
                       </div>

                       <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800/50 flex items-center justify-between group hover:border-blue-500/30 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                              <Cpu className="w-6 h-6" />
                            </div>
                            <div>
                               <p className="font-bold text-white tracking-tight">Performance Caching (IndexedDB)</p>
                               <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Uses browser memory for instant results</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                               const newState = !isLocalCacheEnabled;
                               setIsLocalCacheEnabled(newState);
                               localStorage.setItem("grademaster_local_cache", String(newState));
                               showToast(newState ? "Performance Cache Enabled" : "Performance Cache Disabled", "info");
                            }}
                            className={`w-14 h-8 rounded-full p-1 transition-colors ${isLocalCacheEnabled ? 'bg-blue-500' : 'bg-slate-800'}`}
                          >
                             <div className={`w-6 h-6 bg-white rounded-full transition-transform ${isLocalCacheEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                       </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Account Metadata</h4>
                    <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800/50 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400">
                             <UserIcon className="w-6 h-6" />
                          </div>
                          <div>
                             <p className="font-bold text-white tracking-tight">{user?.displayName || "Professor"}</p>
                             <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">{user?.email}</p>
                          </div>
                       </div>
                       <button
                         onClick={handleLogout}
                         className="px-6 py-3 border border-red-500/30 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all font-display italic"
                       >
                         Logout Session
                       </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeFeature === "about" && (
              <AboutView />
            )}
          </AnimatePresence>
        </React.Suspense>
      </div>
    </main>

      <AnimatePresence>
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
              <div className="max-w-[60%]">
                <h2 className="text-3xl font-bold text-white mb-2">{currentExportingSubmission.studentName}</h2>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Exam</span>
                  <p className="text-sm font-medium text-slate-400">{exams.find(e => e.id === currentExportingSubmission.examId)?.title}</p>
                </div>
                {currentExportingSubmission.evaluationData?.summary && (
                  <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-500/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">AI Executive Summary</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{currentExportingSubmission.evaluationData.summary}</p>
                  </div>
                )}
              </div>
              <div className="text-right flex flex-col items-end">
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

      {/* Onboarding / Permission Gate */}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-[48px] shadow-[0_50px_100px_rgba(0,0,0,0.9)] overflow-hidden p-8 sm:p-12 technical-border my-auto"
            >
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
               
               <div className="flex flex-col items-center mb-8">
                  <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 mb-6 ring-1 ring-blue-500/20">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-display font-black text-white italic text-center tracking-tighter leading-tight">Welcome to GradeMaster</h3>
                  <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-2 text-center">Initialize Your Secure Workspace Before Logging In</p>
               </div>

               <div className="space-y-4 mb-10">
                  <div className="p-6 bg-slate-950/50 rounded-[32px] border border-slate-800/50 group hover:border-blue-500/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
                        <Folders className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-bold tracking-tight">Local Identity Ownership</h4>
                          {isRunningInIframe() && (
                            <span className="text-[8px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest font-black ring-1 ring-slate-700">Preview Restricted</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed italic mb-4">Connect a folder on your computer to store your files locally. This provides instant speed and keeps you in control of your data.</p>
                        {!isNativeStorageEnabled ? (
                          <button 
                            onClick={handleEnableNativeStorage}
                            className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all active:scale-95 flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Connect Local Folder
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                            <CheckCircle className="w-4 h-4" /> Folder Connected Successfully
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-950/50 rounded-[32px] border border-slate-800/50 group hover:border-purple-500/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 shrink-0">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white font-bold tracking-tight mb-1">Smart Scanning Helper</h4>
                        <p className="text-xs text-slate-500 leading-relaxed italic mb-4">Enable camera access to scan student booklets directly via the interface. This will be used only for capturing document images.</p>
                        {browserPermissions.camera !== 'granted' ? (
                          <button 
                            onClick={async () => {
                              try {
                                await navigator.mediaDevices.getUserMedia({ video: true });
                                showToast("Camera permission granted", "success");
                              } catch (e) {
                                showToast("Camera permission denied or not found", "error");
                              }
                            }}
                            className="w-full sm:w-auto px-6 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 transition-all active:scale-95"
                          >
                            Grant Camera Access
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                            <CheckCircle className="w-4 h-4" /> Camera Permission Granted
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
               </div>

               <div className="flex flex-col gap-3">
                 <button
                   onClick={() => {
                     setShowOnboarding(false);
                     localStorage.setItem("grademaster_welcome_complete", "true");
                     if (!isLocalCacheEnabled) {
                       setIsLocalCacheEnabled(true);
                       localStorage.setItem("grademaster_local_cache", "true");
                     }
                   }}
                   className="w-full py-6 rounded-[28px] bg-white text-slate-950 font-black uppercase tracking-[0.2em] text-[12px] hover:bg-slate-200 transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)] active:scale-[0.98]"
                 >
                   Continue to Application
                 </button>
                 <button
                   onClick={() => {
                     setShowOnboarding(false);
                     localStorage.setItem("grademaster_welcome_complete", "true");
                   }}
                   className="w-full py-2 text-slate-600 hover:text-slate-400 transition-colors font-mono text-[9px] uppercase tracking-[0.4em]"
                 >
                   Maybe Later, Continue to Login
                 </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mb-6 mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                
                <h3 className="text-2xl font-bold text-white text-center mb-2">Delete {deleteModal.type === 'exam' ? 'Exam' : 'Submission'}?</h3>
                <p className="text-slate-400 text-center mb-8">
                  Are you sure you want to delete <span className="text-white font-semibold">"{deleteModal.title}"</span>? 
                  {deleteModal.type === 'exam' && " This will permanently remove all associated student submissions and data."}
                  This action cannot be undone.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 px-6 py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (deleteModal.type === 'exam') {
                        handleDeleteExam(deleteModal.id as string);
                      } else {
                        handleDeleteSubmission(deleteModal.id);
                      }
                    }}
                    className="flex-1 px-6 py-4 rounded-2xl bg-rose-600 text-white font-bold hover:bg-rose-500 transition-all shadow-lg shadow-rose-900/20"
                  >
                    Delete Now
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
                type="button"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
