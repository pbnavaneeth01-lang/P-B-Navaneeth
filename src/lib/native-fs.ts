
/**
 * Native File System Access API Utility
 * Allows storing files directly in a folder on the user's computer.
 */

export interface NativeStorageConfig {
  folderHandle: FileSystemDirectoryHandle | null;
  enabled: boolean;
}

export const isNativeStorageSupported = (): boolean => {
  return 'showDirectoryPicker' in window;
};

export const isRunningInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

export const requestNativeFolder = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    // @ts-ignore - File System Access API
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    return handle;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    console.error("Native FS Access Error:", err);
    throw err;
  }
};

export const verifyPermission = async (handle: FileSystemDirectoryHandle, readWrite: boolean = true): Promise<boolean> => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  // @ts-ignore
  if ((await handle.queryPermission(options)) === 'granted') return true;
  // @ts-ignore
  if ((await handle.requestPermission(options)) === 'granted') return true;
  return false;
};

export const saveFileToNative = async (handle: FileSystemDirectoryHandle, fileName: string, blob: Blob): Promise<string> => {
  try {
    const name = fileName.replace(/[/\\?%*:|"<>]/g, '-'); // Sanitize
    const fileHandle = await handle.getFileHandle(name, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return name;
  } catch (err) {
    console.error("Native Save Error:", err);
    throw err;
  }
};

export const getFileFromNative = async (handle: FileSystemDirectoryHandle, fileName: string): Promise<File | null> => {
  try {
    const fileHandle = await handle.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (err) {
    return null;
  }
};
