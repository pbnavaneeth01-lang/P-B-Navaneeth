/**
 * Simple IndexedDB wrapper for offline file storage in Guest Mode
 */

const DB_NAME = "grademaster_offline_storage";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const objectUrlCache = new Map<string, string>();

export const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
      dbPromise = null;
      reject(request.error);
    };
  });
  
  return dbPromise;
};

export const storeFile = async (id: string, file: File | Blob): Promise<string> => {
  // Revoke old URL if overwriting
  const cachedUrl = objectUrlCache.get(id);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    objectUrlCache.delete(id);
  }
  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file, id);
    request.onsuccess = () => resolve(id);
    request.onerror = (e) => {
      console.error("IDB Store Error:", e);
      reject(new Error("Failed to save file to local device storage."));
    };
  });
};

export const getFileBlob = async (id: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const getFileUrl = async (id: string): Promise<string> => {
  // Return cached URL immediately if it exists, avoiding duplicate creation and memory leaks
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) {
        const url = URL.createObjectURL(request.result);
        objectUrlCache.set(id, url);
        resolve(url);
      } else {
        reject(new Error("File not found in local storage"));
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteFile = async (id: string): Promise<void> => {
  const cachedUrl = objectUrlCache.get(id);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    objectUrlCache.delete(id);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllFiles = async (): Promise<void> => {
  objectUrlCache.forEach(url => URL.revokeObjectURL(url));
  objectUrlCache.clear();

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
