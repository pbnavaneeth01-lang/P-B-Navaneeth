import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fixHtml2CanvasOklch = (clonedDoc: Document) => {
  // Tailwind v4 uses modern CSS functions that html2canvas 1.4.x cannot parse.
  // We use a very aggressive regex to replace these with a safe fallback color.
  const problematicRegex = /(oklch|oklab|light-dark|color-mix|lab|lch|hwb)\s*\((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*\)/g;
  const fallbackColor = '#3b82f6';

  // 1. Process all <style> tags in the cloned document
  const styleTags = clonedDoc.getElementsByTagName('style');
  for (let i = 0; i < styleTags.length; i++) {
    const styleTag = styleTags[i];
    if (styleTag.textContent) {
      styleTag.textContent = styleTag.textContent.replace(problematicRegex, fallbackColor);
    }
  }

  // 2. Process all elements with inline styles or style attributes
  const allElements = clonedDoc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    
    // Check inline style object
    if (el.style && el.style.cssText) {
      if (problematicRegex.test(el.style.cssText)) {
        el.style.cssText = el.style.cssText.replace(problematicRegex, fallbackColor);
      }
    }
    
    // Check raw style attribute (sometimes more reliable)
    const styleAttr = el.getAttribute('style');
    if (styleAttr && problematicRegex.test(styleAttr)) {
      el.setAttribute('style', styleAttr.replace(problematicRegex, fallbackColor));
    }
  }
};

export const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve({ data: base64String, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });
};
