import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { Exam, Submission } from "./types";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Sync user profile to Firestore
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
    return user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
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
