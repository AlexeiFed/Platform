"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { submitHomework } from "./actions";

const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET;
const clientPublicUrl = (key: string) =>
  `https://${S3_BUCKET}.storage.yandexcloud.net/${key}`;

const isSupportedHomeworkMedia = (file: File) =>
  file.type.startsWith("image/") || file.type.startsWith("video/");

const isVideoAttachmentUrl = (url: string) => {
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv|ogg)$/.test(normalized);
};

export function HomeworkForm({
  lessonId,
  questions,
}: {
  lessonId: string;
  questions?: string[];
}) {
  const hasQuestions = questions && questions.length > 0;
  const [answers, setAnswers] = useState<string[]>(hasQuestions ? questions.map(() => "") : [""]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function updateAnswer(idx: number, val: string) {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? val : a)));
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(isSupportedHomeworkMedia);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const presignRes = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            path: "homework",
          }),
        });
        if (!presignRes.ok) {
          continue;
        }
        const { url, key } = await presignRes.json();
        await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        uploadedUrls.push(clientPublicUrl(key));
      }

      if (uploadedUrls.length > 0) {
        setMediaUrls((prev) => [...prev, ...uploadedUrls]);
      }
    } catch {
      /* silent */
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const content = hasQuestions
      ? JSON.stringify(questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" })))
      : answers[0] ?? "";

    const res = await submitHomework({
      lessonId,
      content,
      fileUrl: mediaUrls[0] ?? undefined,
      fileUrls: mediaUrls,
    });
    setResult(res);
    setLoading(false);
  }

  if (result?.success) {
    return (
      <div className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm p-3 rounded-lg">
        Домашнее задание отправлено на проверку!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hasQuestions ? (
        questions.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-sm font-medium">{i + 1}. {q}</p>
            <textarea
              value={answers[i]}
              onChange={(e) => updateAnswer(i, e.target.value)}
              placeholder="Ваш ответ..."
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>
        ))
      ) : (
        <textarea
          value={answers[0]}
          onChange={(e) => updateAnswer(0, e.target.value)}
          placeholder="Напишите ваш ответ..."
          className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          required
        />
      )}

      {/* Media attachment (photo/video) */}
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleMediaUpload}
        />

        {mediaUrls.length > 0 && (
          <div className={`grid gap-2 ${mediaUrls.length === 1 ? "grid-cols-1 max-w-xs" : mediaUrls.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
            {mediaUrls.map((mediaUrl, index) => (
              <div key={`${mediaUrl}-${index}`} className="relative">
                {isVideoAttachmentUrl(mediaUrl) ? (
                  <video
                    src={mediaUrl}
                    className="h-32 w-full rounded-lg border bg-black object-cover"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <Image
                    src={mediaUrl}
                    alt={`Прикреплённое фото ${index + 1}`}
                    width={320}
                    height={128}
                    className="h-32 w-full rounded-lg border object-cover"
                    unoptimized
                  />
                )}
                <button
                  type="button"
                  onClick={() => setMediaUrls((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Загрузка...</>
          ) : (
            <><ImagePlus className="mr-1.5 h-4 w-4" /> {mediaUrls.length > 0 ? "Добавить ещё файл" : "Прикрепить фото/видео"}</>
          )}
        </Button>
      </div>

      {result?.error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{result.error}</div>
      )}
      <Button type="submit" disabled={loading || uploading}>
        {loading ? "Отправляем..." : "Отправить"}
      </Button>
    </form>
  );
}
