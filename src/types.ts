export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: string;
}

export interface Exam {
  id?: string;
  uid: string;
  title: string;
  questionPaperUrl: string;
  markingSchemeUrl: string;
  studentList?: string[];
  createdAt: string;
  qpPageCount?: number;
  msPageCount?: number;
  syncStatus?: "ready" | "syncing" | "error";
  status?: string; // Legacy or alternative status
}

export interface EvaluationQuestion {
  questionNumber: string;
  transcription: string;
  marksAwarded: number;
  maxMarks: number;
  feedback: string;
  pageNumber: number;
  boundingBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface Submission {
  id?: string;
  uid: string;
  examId: string;
  studentName: string;
  bookletUrl: string;
  status: "pending" | "evaluated";
  syncStatus?: "ready" | "syncing" | "error";
  totalMarks?: number;
  maxMarks?: number;
  pageCount?: number;
  evaluationData?: {
    summary?: string;
    questions: EvaluationQuestion[];
  };
  createdAt: string;
}

export type AppFeature = "dashboard" | "exams" | "submissions" | "students" | "evaluate" | "about" | "bulk" | "settings";
