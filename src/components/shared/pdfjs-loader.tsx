"use client";

type PdfJsLib = {
  getDocument: (src: any) => { promise: Promise<any> };
  GlobalWorkerOptions: { workerSrc: string };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

// legacy UMD build => window.pdfjsLib
const PDFJS_VERSION = "latest";
const PDFJS_SOURCES = [
  {
    script: `/vendor/pdfjs/${PDFJS_VERSION}/legacy/build/pdf.min.js`,
    worker: `/vendor/pdfjs/${PDFJS_VERSION}/legacy/build/pdf.worker.min.js`,
  },
  {
    script: `https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/legacy/build/pdf.min.js`,
    worker: `https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/legacy/build/pdf.worker.min.js`,
  },
  {
    script: `https://unpkg.com/pdfjs-dist@latest/legacy/build/pdf.min.js`,
    worker: `https://unpkg.com/pdfjs-dist@latest/legacy/build/pdf.worker.min.js`,
  },
] as const;

let pdfjsLoadPromise: Promise<PdfJsLib> | null = null;

export function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdfjs can only load in browser"));
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_SOURCES[0].worker;
    return Promise.resolve(window.pdfjsLib);
  }

  if (!pdfjsLoadPromise) {
    pdfjsLoadPromise = new Promise<PdfJsLib>((resolve, reject) => {
      let idx = 0;

      const tryNext = () => {
        const source = PDFJS_SOURCES[idx];
        if (!source) return reject(new Error("Failed to load pdf.js"));

        const existing = document.querySelector<HTMLScriptElement>(
          `script[data-pdfjs="${PDFJS_VERSION}"][data-src-idx="${idx}"]`,
        );
        if (existing) {
          existing.addEventListener("load", () => {
            if (!window.pdfjsLib) return reject(new Error("pdfjsLib not available after script load"));
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = source.worker;
            resolve(window.pdfjsLib);
          });
          existing.addEventListener("error", () => {
            idx += 1;
            tryNext();
          });
          return;
        }

        const s = document.createElement("script");
        s.src = source.script;
        s.async = true;
        s.dataset.pdfjs = PDFJS_VERSION;
        s.dataset.srcIdx = String(idx);
        s.onload = () => {
          if (!window.pdfjsLib) {
            idx += 1;
            tryNext();
            return;
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = source.worker;
          resolve(window.pdfjsLib);
        };
        s.onerror = () => {
          idx += 1;
          tryNext();
        };
        document.head.appendChild(s);
      };

      tryNext();
    });
  }

  return pdfjsLoadPromise;
}

