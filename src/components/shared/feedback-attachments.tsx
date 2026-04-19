/**
 * feedback-attachments.tsx
 * Переиспользуемые компоненты для обратной связи:
 * - хук useFeedbackUploader — загрузка изображений/видео в S3 через presign
 * - AttachmentsPreview — превью уже прикреплённых (в поле ввода)
 * - AttachmentsView — рендер вложений внутри «пузыря» сообщения
 */
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Paperclip, Loader2, X, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDeletion } from "@/lib/confirm-deletion";

const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET;
const publicUrl = (key: string) =>
  `https://${S3_BUCKET}.storage.yandexcloud.net/${key}`;

export type FeedbackAttachment = {
  url: string;
  type: "image" | "video" | "file";
  name?: string;
  size?: number;
};

function detectType(file: File): FeedbackAttachment["type"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

/**
 * Загрузка файлов в S3, возвращает массив вложений.
 * path — поддиректория ключа в бакете (для разделения feedback/ профилей).
 */
export function useFeedbackUploader(path: string) {
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: File[]): Promise<FeedbackAttachment[]> {
    if (files.length === 0) return [];
    setUploading(true);
    const result: FeedbackAttachment[] = [];
    try {
      for (const file of files) {
        const presignRes = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            path,
          }),
        });
        if (!presignRes.ok) continue;
        const { url, key } = await presignRes.json();
        const putRes = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) continue;
        result.push({
          url: publicUrl(key),
          type: detectType(file),
          name: file.name,
          size: file.size,
        });
      }
    } finally {
      setUploading(false);
    }
    return result;
  }

  return { uploading, uploadFiles };
}

type AttachButtonProps = {
  uploading: boolean;
  onFiles: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
};

/** Кнопка-скрепка с невидимым input[file]. */
export function AttachButton({
  uploading,
  onFiles,
  accept = "image/*,video/*",
  disabled,
}: AttachButtonProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => ref.current?.click()}
        disabled={uploading || disabled}
        className="h-10 w-10 shrink-0"
        aria-label="Прикрепить файл"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}

/** Превью ещё не отправленных вложений — над полем ввода. */
export function AttachmentsPreview({
  items,
  onRemove,
}: {
  items: FeedbackAttachment[];
  onRemove: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((a, i) => (
        <div
          key={`${a.url}-${i}`}
          className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted"
        >
          {a.type === "image" ? (
            <Image
              src={a.url}
              alt={a.name ?? "attachment"}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : a.type === "video" ? (
            <video src={a.url} className="h-full w-full object-cover" muted />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <span className="line-clamp-2 text-[10px] text-muted-foreground">{a.name ?? "файл"}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirmDeletion("Убрать вложение из списка перед отправкой?")) return;
              onRemove(i);
            }}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
            aria-label="Удалить вложение"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Рендер вложений внутри «пузыря» сообщения (в ленте). */
export function AttachmentsView({ items }: { items: FeedbackAttachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {items.map((a, i) => {
        if (a.type === "image") {
          return (
            <a
              key={`${a.url}-${i}`}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="relative block h-32 w-full overflow-hidden rounded-lg border"
            >
              <Image
                src={a.url}
                alt={a.name ?? "image"}
                fill
                sizes="(max-width: 640px) 50vw, 200px"
                className="object-cover"
                unoptimized
              />
            </a>
          );
        }
        if (a.type === "video") {
          return (
            <video
              key={`${a.url}-${i}`}
              src={a.url}
              controls
              className="h-40 w-full rounded-lg border bg-black object-contain"
            />
          );
        }
        return (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2 text-xs text-foreground hover:bg-accent/50"
          >
            <FileIcon className="h-4 w-4" />
            <span className="truncate">{a.name ?? "файл"}</span>
          </a>
        );
      })}
    </div>
  );
}

/** Безопасно парсим attachments из JSON-поля БД. */
export function parseAttachments(raw: unknown): FeedbackAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is FeedbackAttachment => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.url === "string" && (o.type === "image" || o.type === "video" || o.type === "file");
  });
}
