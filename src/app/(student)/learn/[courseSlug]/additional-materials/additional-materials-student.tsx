"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Download, Eye, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { getAdditionalMaterialDownloadUrl, type StudentMaterialRow } from "./actions";

const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET;

function clientPublicUrl(key: string) {
  return `https://${S3_BUCKET}.storage.yandexcloud.net/${key}`;
}

function isPdfMaterial(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === "application/pdf" || m.includes("pdf");
}

export const AdditionalMaterialsStudent = ({
  courseSlug,
  materials,
}: {
  courseSlug: string;
  materials: StudentMaterialRow[];
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function download(id: string) {
    setLoadingId(id);
    try {
      const res = await getAdditionalMaterialDownloadUrl(courseSlug, id);
      if (!res.success) {
        window.alert(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingId(null);
    }
  }

  if (materials.length === 0) {
    return (
      <p className={cn(tokens.typography.body, "rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center")}>
        Пока нет дополнительных материалов.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {materials.map((m) => {
        const coverSrc = m.coverKey
          ? clientPublicUrl(m.coverKey)
          : m.mimeType.startsWith("image/")
            ? clientPublicUrl(m.fileKey)
            : null;
        const busy = loadingId === m.id;
        const isPdf = isPdfMaterial(m.mimeType);
        return (
          <Card
            key={m.id}
            className={cn(tokens.shadow.card, tokens.radius.lg, "overflow-hidden border-border")}
          >
            <CardContent className="flex flex-col gap-3 p-4">
              <button
                type="button"
                className={cn(
                  "relative aspect-[3/4] w-full overflow-hidden text-left outline-none ring-offset-background",
                  tokens.radius.md,
                  "border border-border focus-visible:ring-2 focus-visible:ring-ring"
                )}
                onClick={() => void download(m.id)}
                aria-label={`Скачать ${m.title}`}
              >
                {coverSrc ? (
                  <Image
                    src={coverSrc}
                    alt={m.title}
                    fill
                    className="object-cover"
                    sizes="(max-width:768px) 100vw, 33vw"
                  />
                ) : (
                  <div className="flex h-full min-h-[200px] items-center justify-center bg-muted text-muted-foreground">
                    {m.mimeType === "application/pdf" ? (
                      <BookOpen className="h-14 w-14 opacity-40" aria-hidden />
                    ) : (
                      <GraduationCap className="h-14 w-14 opacity-40" aria-hidden />
                    )}
                  </div>
                )}
              </button>
              <p className="line-clamp-2 text-center text-sm font-medium leading-snug">{m.title}</p>
              {isPdf && m.previewPageKeys?.length ? (
                <p className="text-center text-xs text-muted-foreground">Быстрый просмотр (готовые страницы)</p>
              ) : null}
              <div className="flex flex-col gap-2">
                {isPdf ? (
                  <Button type="button" variant="secondary" className="w-full" asChild>
                    <Link
                      href={`/learn/${courseSlug}/additional-materials/${m.id}`}
                      aria-label={`Посмотреть PDF: ${m.title}`}
                    >
                      <Eye className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      Посмотреть
                    </Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void download(m.id)}
                  disabled={busy}
                  aria-label={`Скачать файл ${m.title}`}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Скачать
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
