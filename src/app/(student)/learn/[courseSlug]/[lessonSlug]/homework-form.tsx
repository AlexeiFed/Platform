"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { submitHomework } from "./actions";

const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET;
const clientPublicUrl = (key: string) =>
  `https://${S3_BUCKET}.storage.yandexcloud.net/${key}`;

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
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function updateAnswer(idx: number, val: string) {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? val : a)));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((file) => file.type.startsWith("image/"));
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
        setPhotoUrls((prev) => [...prev, ...uploadedUrls]);
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
      fileUrl: photoUrls[0] ?? undefined,
      fileUrls: photoUrls,
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

      {/* Photo attachment */}
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoUpload}
        />

        {photoUrls.length > 0 && (
          <div className={`grid gap-2 ${photoUrls.length === 1 ? "grid-cols-1 max-w-xs" : photoUrls.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
            {photoUrls.map((photoUrl, index) => (
              <div key={`${photoUrl}-${index}`} className="relative">
                <img
                  src={photoUrl}
                  alt={`Прикреплённое фото ${index + 1}`}
                  className="h-32 w-full rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
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
            <><ImagePlus className="mr-1.5 h-4 w-4" /> {photoUrls.length > 0 ? "Добавить ещё фото" : "Прикрепить фото"}</>
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
