"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BookOpen, GraduationCap, Loader2, Trash2, Upload } from "lucide-react";
import { loadPdfJs } from "@/components/shared/pdfjs-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import {
  createAdditionalMaterial,
  deleteAdditionalMaterial,
  listAdditionalMaterialsAdmin,
  updateAdditionalMaterial,
  type AdminMaterialRow,
} from "./actions";

const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET;

function clientPublicUrl(key: string) {
  return `https://${S3_BUCKET}.storage.yandexcloud.net/${key}`;
}

async function renderPdfFirstPageToWebp(pdfPublicUrl: string): Promise<Blob> {
  const pdfjs = await loadPdfJs();
  const proxiedUrl = `/api/pdf?src=${encodeURIComponent(pdfPublicUrl)}`;
  const doc = await pdfjs.getDocument({ url: proxiedUrl, withCredentials: true }).promise;
  const page = await doc.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const targetWidth = 480;
  const scale = Math.max(0.1, targetWidth / v1.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob"))),
      "image/webp",
      0.78
    );
  });
  return blob;
}

type ProductOption = { id: string; title: string; type: "COURSE" | "MARATHON" };

export const AdditionalMaterialsManager = ({
  products,
  initialProductId,
}: {
  products: ProductOption[];
  initialProductId: string | null;
}) => {
  const [productId, setProductId] = useState<string | null>(initialProductId);
  const [materials, setMaterials] = useState<AdminMaterialRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [visibilityFrom, setVisibilityFrom] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!productId) {
      setMaterials([]);
      return;
    }
    setLoadingList(true);
    setMessage(null);
    try {
      const res = await listAdditionalMaterialsAdmin(productId);
      if (res.success) setMaterials(res.data);
      else setMessage(res.error);
    } finally {
      setLoadingList(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(files: FileList | null) {
    if (!productId || !files?.length) return;
    setUploading(true);
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        const folderId = crypto.randomUUID();
        const path = `courses/${productId}/additional-materials/${folderId}`;
        const presignRes = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
            path,
          }),
        });
        if (!presignRes.ok) {
          setMessage("Не удалось получить ссылку на загрузку");
          continue;
        }
        const { url, key: fileKey } = (await presignRes.json()) as { url: string; key: string };
        const put = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) {
          setMessage("Ошибка загрузки файла");
          continue;
        }

        const publicPdfUrl = clientPublicUrl(fileKey);
        let coverKey: string | null = null;
        if (file.type === "application/pdf") {
          try {
            const webpBlob = await renderPdfFirstPageToWebp(publicPdfUrl);
            const coverName = "cover.webp";
            const presignCover = await fetch("/api/s3/presign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: coverName,
                contentType: "image/webp",
                size: webpBlob.size,
                path,
              }),
            });
            if (presignCover.ok) {
              const { url: cUrl, key: cKey } = (await presignCover.json()) as { url: string; key: string };
              const putC = await fetch(cUrl, {
                method: "PUT",
                body: webpBlob,
                headers: { "Content-Type": "image/webp" },
              });
              if (putC.ok) coverKey = cKey;
            }
          } catch {
            /* обложка опциональна */
          }
        }

        const titleBase = file.name.replace(/\.[^/.]+$/, "").trim() || file.name;
        const vis = visibilityFrom.trim() || null;
        const created = await createAdditionalMaterial({
          productId,
          fileKey,
          coverKey,
          title: titleBase,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          visibilityFrom: vis,
        });
        if (!created.success) setMessage(created.error);
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function saveRow(m: AdminMaterialRow, title: string, vis: string) {
    setMessage(null);
    const res = await updateAdditionalMaterial({
      id: m.id,
      title,
      visibilityFrom: vis.trim() || null,
    });
    if (!res.success) setMessage(res.error);
    else await load();
  }

  async function remove(id: string) {
    if (!confirm("Удалить материал и файлы в хранилище?")) return;
    setMessage(null);
    const res = await deleteAdditionalMaterial(id);
    if (!res.success) setMessage(res.error);
    else await load();
  }

  if (products.length === 0) {
    return <p className={tokens.typography.body}>Нет курсов для привязки материалов.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <span className={tokens.typography.label} id="am-product-label">
            Курс / марафон
          </span>
          <select
            id="am-product"
            aria-labelledby="am-product-label"
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tokens.radius.md
            )}
            value={productId ?? ""}
            onChange={(e) => setProductId(e.target.value || null)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.type === "MARATHON" ? "Марафон: " : "Курс: "}
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <span className={tokens.typography.label} id="am-vis-label">
            Видимость новых загрузок с даты (пусто — всегда)
          </span>
          <Input
            id="am-vis"
            aria-labelledby="am-vis-label"
            type="date"
            value={visibilityFrom}
            onChange={(e) => setVisibilityFrom(e.target.value)}
            className={tokens.radius.md}
          />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <span id="am-file-label" className="sr-only">
            Загрузка файлов
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              id="am-file"
              type="file"
              className="hidden"
              aria-labelledby="am-file-label"
              multiple
              disabled={!productId || uploading}
              onChange={(e) => {
                void onUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="default"
              disabled={!productId || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Загрузить
            </Button>
          </div>
        </div>
      </div>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      {loadingList ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Загрузка" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => (
            <MaterialAdminCard key={m.id} row={m} onSave={saveRow} onDelete={remove} />
          ))}
        </div>
      )}

      {!loadingList && materials.length === 0 && productId ? (
        <p className={tokens.typography.small}>Пока нет материалов для выбранного продукта.</p>
      ) : null}
    </div>
  );
};

function MaterialAdminCard({
  row,
  onSave,
  onDelete,
}: {
  row: AdminMaterialRow;
  onSave: (m: AdminMaterialRow, title: string, vis: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(row.title);
  const [vis, setVis] = useState(row.visibilityFrom ? row.visibilityFrom.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(row.title);
    setVis(row.visibilityFrom ? row.visibilityFrom.slice(0, 10) : "");
  }, [row.id, row.title, row.visibilityFrom]);

  const coverSrc = row.coverKey
    ? clientPublicUrl(row.coverKey)
    : row.mimeType.startsWith("image/")
      ? clientPublicUrl(row.fileKey)
      : null;

  return (
    <Card className={cn(tokens.shadow.card, tokens.radius.lg, "overflow-hidden border-border")}>
      <CardContent className="p-4 space-y-3">
        <div
          className={cn(
            "relative aspect-[3/4] w-full overflow-hidden bg-muted",
            tokens.radius.md,
            "border border-border"
          )}
        >
          {coverSrc ? (
            <Image
              src={coverSrc}
              alt={row.title}
              fill
              className="object-cover"
              sizes="(max-width:768px) 100vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {row.mimeType === "application/pdf" ? (
                <BookOpen className="h-12 w-12 opacity-40" aria-hidden />
              ) : (
                <GraduationCap className="h-12 w-12 opacity-40" aria-hidden />
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Название</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className={tokens.radius.md} />
        </div>
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Видимость с</span>
          <Input type="date" value={vis} onChange={(e) => setVis(e.target.value)} className={tokens.radius.md} />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(row, title, vis);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => void onDelete(row.id)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
