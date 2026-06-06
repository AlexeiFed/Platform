/**
 * Унифицированный плеер: mp4/webm, iOS/Safari-safe через canPlayType.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { tokens } from "@/lib/design-tokens";
import {
  canPlayVideoUrl,
  detectVideoContainer,
  mimeTypeForContainer,
  unsupportedPlaybackMessage,
} from "@/lib/video-playback";

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

export const LessonVideoPlayer = ({ src, title = "Видео урока" }: LessonVideoPlayerProps) => {
  const [hasError, setHasError] = useState(false);
  const [playbackSupported, setPlaybackSupported] = useState<boolean | null>(null);

  const normalizedSrc = useMemo(() => normalizeVideoUrl(src), [src]);
  const container = useMemo(() => detectVideoContainer(normalizedSrc), [normalizedSrc]);
  const mimeType = mimeTypeForContainer(container);

  useEffect(() => {
    setHasError(false);
    setPlaybackSupported(canPlayVideoUrl(normalizedSrc));
  }, [normalizedSrc]);

  const showPlayer = playbackSupported !== false && !hasError;

  return (
    <div className="w-full overflow-hidden rounded-xl bg-black">
      {showPlayer ? (
        <div className="aspect-video w-full">
          <video
            key={normalizedSrc}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload"
            className="h-full w-full"
            onError={() => setHasError(true)}
            aria-label={title}
          >
            {mimeType ? <source src={normalizedSrc} type={mimeType} /> : null}
            <source src={normalizedSrc} />
          </video>
        </div>
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center gap-3 px-4 text-center text-white">
          <AlertCircle className="h-5 w-5" aria-hidden />
          <p className={tokens.typography.small}>{unsupportedPlaybackMessage(normalizedSrc)}</p>
          <a
            href={normalizedSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Открыть файл отдельно
          </a>
        </div>
      )}
    </div>
  );
};
