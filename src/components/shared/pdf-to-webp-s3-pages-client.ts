"use client";

import { loadPdfJs } from "@/components/shared/pdfjs-loader";

const DEFAULT_MAX = 60;
const TARGET_WIDTH = 900;
const WEBP_QUALITY = 0.75;

function publicUrlForS3Key(key: string): string {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;
  if (!bucket) return key;
  return `https://${bucket}.storage.yandexcloud.net/${key}`;
}

/**
 * Рендер PDF в WebP и загрузка в S3 под `uploadPathPrefix` (без хвостового `/`).
 * Имена файлов с UUID, чтобы presign не подбирал «(2)» при коллизии.
 */
export async function uploadPdfPagesAsWebpToS3(opts: {
  pdfFileKey: string;
  uploadPathPrefix: string;
  maxPages?: number;
}): Promise<string[]> {
  const { pdfFileKey, uploadPathPrefix } = opts;
  const maxPages = opts.maxPages ?? DEFAULT_MAX;
  const base = uploadPathPrefix.replace(/\/+$/, "");

  const pdfjs = await loadPdfJs();
  const pdfPublicUrl = publicUrlForS3Key(pdfFileKey);
  const proxiedUrl = `/api/pdf?src=${encodeURIComponent(pdfPublicUrl)}`;
  const doc = await pdfjs.getDocument({ url: proxiedUrl, withCredentials: true }).promise;

  const total = doc.numPages;
  const renderTotal = Math.min(total, maxPages);
  const keys: string[] = [];

  for (let i = 1; i <= renderTotal; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.max(0.1, TARGET_WIDTH / v1.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas ctx missing");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/webp",
        WEBP_QUALITY
      );
    });

    const fileName = `page-${String(i).padStart(3, "0")}-${crypto.randomUUID()}.webp`;
    const presignRes = await fetch("/api/s3/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName,
        contentType: "image/webp",
        size: blob.size,
        path: base,
      }),
    });
    if (!presignRes.ok) throw new Error("presign failed");
    const { url, key } = (await presignRes.json()) as { url: string; key: string };
    const put = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/webp" } });
    if (!put.ok) throw new Error("S3 upload failed");
    keys.push(key);
  }

  return keys;
}
