import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updateProfile 
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, deleteDoc, getDocFromServer, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";
import { Exam, Submission } from "./types";

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const syncUserProfile = async (user: any) => {
  const userRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: new Date().toISOString(),
    });
  }
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    console.error("Error signing in with Google:", error);
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error("UNAUTHORIZED_DOMAIN: This domain is not authorized in the Firebase Console. Please add 'grademasterai.vercel.app' to Authorized Domains in your Firebase Auth settings.");
    }
    throw error;
  }
};

export const signUpWithEmail = async (email: string, pass: string, name: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(result.user, { displayName: name });
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    console.error("Error signing up with email:", error);
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error("UNAUTHORIZED_DOMAIN: This domain is not authorized in the Firebase Console. Please add 'grademasterai.vercel.app' to Authorized Domains in your Firebase Auth settings.");
    }
    throw error;
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    console.error("Error logging in with email:", error);
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error("UNAUTHORIZED_DOMAIN: This domain is not authorized in the Firebase Console. Please add 'grademasterai.vercel.app' to Authorized Domains in your Firebase Auth settings.");
    }
    throw error;
  }
};

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error resetting password:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// Exam Functions
export const createExam = async (exam: Omit<Exam, "id">) => {
  try {
    const docRef = await addDoc(collection(db, "exams"), exam);
    return { id: docRef.id, ...exam };
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
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exams/${id}`);
  }
};

// Submission Functions
export const createSubmission = async (submission: Omit<Submission, "id">) => {
  try {
    const docRef = await addDoc(collection(db, "submissions"), submission);
    return { id: docRef.id, ...submission };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "submissions");
  }
};

export const updateSubmission = async (id: string, data: Partial<Submission>) => {
  try {
    const docRef = doc(db, "submissions", id);
    await updateDoc(docRef, data);
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
