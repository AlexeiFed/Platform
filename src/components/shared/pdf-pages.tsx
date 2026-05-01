"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PdfJsLib = {
  getDocument: (src: { url: string }) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDFJS_VERSION = "4.10.38";
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let pdfjsLoadPromise: Promise<PdfJsLib> | null = null;

function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdfjs can only load in browser"));
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    return Promise.resolve(window.pdfjsLib);
  }

  if (!pdfjsLoadPromise) {
    pdfjsLoadPromise = new Promise<PdfJsLib>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-pdfjs="${PDFJS_VERSION}"]`);
      if (existing) {
        existing.addEventListener("load", () => {
          if (!window.pdfjsLib) return reject(new Error("pdfjsLib not available after script load"));
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
          resolve(window.pdfjsLib);
        });
        existing.addEventListener("error", () => reject(new Error("Failed to load pdf.js")));
        return;
      }

      const s = document.createElement("script");
      s.src = PDFJS_SRC;
      s.async = true;
      s.dataset.pdfjs = PDFJS_VERSION;
      s.onload = () => {
        if (!window.pdfjsLib) return reject(new Error("pdfjsLib not available after script load"));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error("Failed to load pdf.js"));
      document.head.appendChild(s);
    });
  }

  return pdfjsLoadPromise;
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setWidth(el.getBoundingClientRect().width);
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

export function PdfPages({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const width = useElementWidth(rootRef);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [pageCount, setPageCount] = useState<number>(0);

  const renderKey = useMemo(() => `${url}::${Math.round(width)}`, [url, width]);

  useEffect(() => {
    let cancelled = false;
    let doc: PdfDocument | null = null;

    async function run() {
      if (!url || width <= 0) return;

      setStatus("loading");
      setError("");

      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;

        setPageCount(doc.numPages);
        setStatus("ready");

        // Render sequentially (memory-friendly)
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(`canvas[data-page="${i}"]`) ?? null;
          if (!canvas) continue;

          const page = await doc.getPage(i);
          if (cancelled) return;

          // First get viewport at scale=1 to compute desired scale
          const v1 = page.getViewport({ scale: 1 });
          const scale = Math.max(0.1, width / v1.width);
          const viewport = page.getViewport({ scale });

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "PDF error");
      }
    }

    void run();
    return () => {
      cancelled = true;
      void doc;
    };
  }, [renderKey, url, width]);

  return (
    <div ref={rootRef} className={cn("w-full", className)}>
      {status === "error" ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Не удалось загрузить PDF.{" "}
          <a className="text-primary hover:underline" href={url} target="_blank" rel="noreferrer">
            Открыть в новой вкладке
          </a>
          {error ? <div className="mt-2 text-xs opacity-80">{error}</div> : null}
        </div>
      ) : null}

      {(status === "idle" || status === "loading") && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Загружаем PDF…
        </div>
      )}

      {status === "ready" && pageCount > 0 && (
        <div className="space-y-3">
          {Array.from({ length: pageCount }).map((_, idx) => {
            const pageNumber = idx + 1;
            return (
              <div key={pageNumber} className="overflow-hidden rounded-lg border bg-background">
                <canvas data-page={pageNumber} className="block w-full" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

