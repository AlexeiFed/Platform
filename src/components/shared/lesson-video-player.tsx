/**
 * Назначение: Унифицированный плеер для уроков с iOS/Safari-safe fallback.
 * Описание: Нормализует URL видео (encode пути), обрабатывает ошибки загрузки
 * и показывает пользователю явную ссылку на открытие файла, чтобы избежать
 * пустого/белого экрана при неподдерживаемом формате или битом URL.
 */
"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { tokens } from "@/lib/design-tokens";

type LessonVideoPlayerProps = {
  src: string;
  title?: string;
};

const encodePathSegment = (segment: string) => {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
};

const normalizeVideoUrl = (rawUrl: string) => {
  if (!rawUrl) return rawUrl;

  // Для относительных URL используем стандартное encodeURI.
  if (!/^https?:\/\//i.test(rawUrl)) {
    return encodeURI(rawUrl);
  }

  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname
      .split("/")
      .map(encodePathSegment)
      .join("/");
    return url.toString();
  } catch {
    return encodeURI(rawUrl);
  }
};

const isPotentiallyUnsupportedOnIOS = (url: string) => /\.(webm|ogv)(?:$|\?)/i.test(url);

export const LessonVideoPlayer = ({ src, title = "Видео урока" }: LessonVideoPlayerProps) => {
  const [hasError, setHasError] = useState(false);

  // Нормализуем путь (пробелы/кириллица в имени файла), что критично для Safari.
  const normalizedSrc = useMemo(() => normalizeVideoUrl(src), [src]);
  const unsupportedOnIOS = useMemo(() => isPotentiallyUnsupportedOnIOS(normalizedSrc), [normalizedSrc]);

  return (
    <div className="w-full overflow-hidden rounded-xl bg-black">
      {!hasError && !unsupportedOnIOS ? (
        <div className="aspect-video w-full">
          <video
            src={normalizedSrc}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload"
            className="h-full w-full"
            onError={() => setHasError(true)}
            aria-label={title}
          />
        </div>
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center gap-3 px-4 text-center text-white">
          <AlertCircle className="h-5 w-5" aria-hidden />
          <p className={tokens.typography.small}>
            Видео не удалось открыть в плеере. Для S3 mp4/mov на iPhone это обычно URL или неподдерживаемый кодек.
          </p>
          <a
            href={normalizedSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Открыть видео отдельно
          </a>
        </div>
      )}
    </div>
  );
};
