/** Определение поддержки форматов в текущем браузере (client-only). */

export type VideoContainer = "mp4" | "webm" | "unknown";

export function detectVideoContainer(url: string): VideoContainer {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".mp4") || path.endsWith(".m4v")) return "mp4";
  if (path.endsWith(".webm") || path.endsWith(".ogv")) return "webm";
  return "unknown";
}

export function mimeTypeForContainer(container: VideoContainer): string | undefined {
  if (container === "mp4") return "video/mp4";
  if (container === "webm") return "video/webm";
  return undefined;
}

/** Проверка через canPlayType — корректно для iOS (webm → false) и Android/desktop. */
export function canPlayVideoUrl(url: string): boolean {
  if (typeof document === "undefined") return true;

  const container = detectVideoContainer(url);
  const video = document.createElement("video");

  if (container === "mp4") {
    return (
      video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== "" ||
      video.canPlayType('video/mp4; codecs="h264, aac"') !== "" ||
      video.canPlayType("video/mp4") !== ""
    );
  }

  if (container === "webm") {
    return (
      video.canPlayType('video/webm; codecs="vp9, opus"') !== "" ||
      video.canPlayType('video/webm; codecs="vp8, opus"') !== "" ||
      video.canPlayType("video/webm") !== ""
    );
  }

  return true;
}

export function unsupportedPlaybackMessage(url: string): string {
  const container = detectVideoContainer(url);
  if (container === "webm") {
    return "Формат WebM не поддерживается в Safari/iOS. Новые записи эфира сохраняются в MP4. Откройте с компьютера или Android.";
  }
  return "Видео не удалось открыть в этом браузере. Проверьте формат файла или откройте ссылку отдельно.";
}
