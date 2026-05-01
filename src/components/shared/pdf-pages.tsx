"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { loadPdfJs } from "@/components/shared/pdfjs-loader";

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

type PdfJsLib = Awaited<ReturnType<typeof loadPdfJs>>;

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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForCanvas(
  root: HTMLDivElement,
  pageNumber: number,
  timeoutMs = 5000,
): Promise<HTMLCanvasElement | null> {
  const start = Date.now();
  // ждём пока React реально отрисует <canvas>
  while (Date.now() - start < timeoutMs) {
    const canvas = root.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
    if (canvas) return canvas;
    // небольшая пауза без busy-loop
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
  return null;
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
  const [renderedPages, setRenderedPages] = useState<number>(0);

  const proxiedUrl = useMemo(() => `/api/pdf?src=${encodeURIComponent(url)}`, [url]);
  const renderKey = useMemo(() => `${proxiedUrl}::${Math.round(width)}`, [proxiedUrl, width]);

  useEffect(() => {
    let cancelled = false;
    let doc: PdfDocument | null = null;

    async function run() {
      if (!url || width <= 0) return;

      setStatus("loading");
      setError("");
      setPageCount(0);
      setRenderedPages(0);

      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        if (!pdfjs || typeof pdfjs.getDocument !== "function") {
          setStatus("error");
          setError("pdf.js не инициализировался (pdfjsLib missing)");
          return;
        }

        // Важно: на некоторых устройствах/браузерах pdf.js может не послать cookie,
        // без этого /api/pdf не увидит сессию.
        doc = await pdfjs.getDocument({ url: proxiedUrl, withCredentials: true } as any).promise;
        if (cancelled) return;
        if (!doc) throw new Error("PDF document is null");

        setPageCount(doc.numPages);
        setStatus("ready");

        // Дождаться, пока React отрисует канвасы под страницы.
        await nextFrame();
        await nextFrame();

        // Render sequentially (memory-friendly)
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const root = rootRef.current;
          if (!root) return;
          const canvas = await waitForCanvas(root, i);
          if (!canvas) {
            // Если не нашли canvas — значит DOM не совпал с ожиданием, дальше рендер бессмысленен.
            setStatus("error");
            setError(`Не удалось подготовить страницу ${i} для рендера`);
            return;
          }

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
          setRenderedPages((prev) => (prev < i ? i : prev));
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
          <a className="text-primary hover:underline" href={proxiedUrl} target="_blank" rel="noreferrer">
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
          <div className="text-xs text-muted-foreground">
            Страницы: {renderedPages}/{pageCount}
          </div>
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

