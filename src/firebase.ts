import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, deleteDoc, getDocFromServer, enableIndexedDbPersistence, serverTimestamp, Timestamp, FieldValue } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";
import { Exam, Submission } from "./types";
import { safeJsonStringify } from "./lib/utils";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn("Firestore persistence failed: Multiple tabs open.");
    } else if (err.code === 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn("Firestore persistence failed: Browser not supported.");
    }
  });
} catch (err) {
  console.error("Critical error enabling persistence:", err);
}

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // Extract error message safely
  let errorMessage = "Unknown Firestore error";
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    try {
      errorMessage = String(error);
    } catch (e) {
      errorMessage = "Non-stringifiable error object";
    }
  }

  // Create a clean, flat object for logging
  const errInfo = {
    error: errorMessage,
    operationType,
    path,
    timestamp: new Date().toISOString(),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || false,
    }
  };
  
  try {
    const serialized = safeJsonStringify(errInfo);
    console.error('Firestore Error:', serialized);
    throw new Error(serialized);
  } catch (e) {
    // If serialization fails, throw a simple string
    console.error('Firestore Error (serialization failed):', errorMessage);
    throw new Error(errorMessage);
  }
}

const syncUserProfile = async (user: any) => {
  try {
    const userRef = doc(db, "users", user.uid);
    // Use getDocFromServer to avoid cache issues during first sign in
    const userDoc = await getDocFromServer(userRef).catch(() => getDoc(userRef));
    
    if (!userDoc.exists()) {
      console.log("Creating new user profile for:", user.uid);
      const data = sanitizeData({
        uid: user.uid,
        displayName: user.displayName || null,
        email: user.email || null,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      });
      await setDoc(userRef, data);
      console.log("User profile created successfully");
    } else {
      console.log("User profile already exists for:", user.uid);
    }
  } catch (error) {
    console.error("Error syncing user profile:", error);
    // Don't throw here to avoid blocking sign in
  }
};

export const signInWithGoogle = async () => {
  try {
    console.log("Initiating Google sign in...");
    // If we're already signed in, just return user
    if (auth.currentUser) {
      console.log("User already signed in, syncing profile...");
      await syncUserProfile(auth.currentUser);
      return auth.currentUser;
    }
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Sign in successful, syncing profile...");
    // We don't necessarily need to await syncUserProfile to return from sign in
    // but we'll do it for data consistency, with a catch inside
    await syncUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// Utility to remove undefined values before Firestore write
const sanitizeData = (data: any) => {
  if (data === null || data === undefined || typeof data !== 'object') return data;
  
  // If it's a special Firestore object (Timestamp, FieldValue sentinel), return it as is
  if (data instanceof Timestamp || data instanceof FieldValue) {
    return data;
  }

  // Fallback for FieldValue if instanceof fails (e.g. across bundles)
  if (data.constructor && (data.constructor.name === 'FieldValue' || data.constructor.name === 'o')) {
    return data;
  }

  // If it's an array, sanitize its elements
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  // It's a plain object, sanitize its keys
  const sanitized: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      sanitized[key] = sanitizeData(data[key]);
    }
  });
  return sanitized;
};

// Exam Functions
export const createExam = async (exam: Omit<Exam, "id" | "createdAt">) => {
  try {
    const data = sanitizeData({
      ...exam,
      createdAt: serverTimestamp()
    });
    const docRef = await addDoc(collection(db, "exams"), data);
    return { id: docRef.id, ...exam, createdAt: new Date().toISOString() };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "exams");
  }
};

export const deleteExam = async (id: string) => {
  try {
    await deleteDoc(doc(db, "exams", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
  }
};

export const updateExam = async (id: string, data: Partial<Exam>) => {
  try {
    const docRef = doc(db, "exams", id);
    const sanitizedData = sanitizeData({
      ...data,
      updatedAt: serverTimestamp()
    });
    await updateDoc(docRef, sanitizedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exams/${id}`);
  }
};

// Submission Functions
export const createSubmission = async (submission: Omit<Submission, "id" | "createdAt">) => {
  try {
    const data = sanitizeData({
      ...submission,
      createdAt: serverTimestamp()
    });
    const docRef = await addDoc(collection(db, "submissions"), data);
    return { id: docRef.id, ...submission, createdAt: new Date().toISOString() };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "submissions");
  }
};

export const updateSubmission = async (id: string, data: Partial<Submission>) => {
  try {
    const docRef = doc(db, "submissions", id);
    const sanitizedData = sanitizeData({
      ...data,
      updatedAt: serverTimestamp()
    });
    await updateDoc(docRef, sanitizedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${id}`);
  }
};

export const deleteSubmission = async (id: string) => {
  try {
    await deleteDoc(doc(db, "submissions", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `submissions/${id}`);
  }
};

export async function testConnection() {
  try {
    // Testing connection to a dummy doc
    await getDocFromServer(doc(db, 'system', 'connection-test'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('network'))) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}
