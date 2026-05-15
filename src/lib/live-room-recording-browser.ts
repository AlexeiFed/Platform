/** Только импорт из client-компонентов (MediaRecorder, AudioContext). */

export type RecordingFormat = "webm" | "mp4";

export function pickRecordingFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  const webmCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of webmCandidates) {
    if (MediaRecorder.isTypeSupported(t)) return "webm";
  }
  if (MediaRecorder.isTypeSupported("video/mp4")) return "mp4";
  return null;
}

export function pickRecorderMime(format: RecordingFormat): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (format === "mp4") {
    return MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : undefined;
  }
  const order = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of order) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

type CaptureRelease = { release?: () => void };

const CAPTURE_W = 1280;
const CAPTURE_H = 720;

/**
 * Canvas-композит сцены. Не используем video.captureStream() на WebRTC video:
 * в Chrome это замирает запись после 1 кадра и может убрать превью участника с экрана.
 */
function startCanvasStageCapture(stage: HTMLElement, fps = 30): (MediaStream & CaptureRelease) | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  canvas.width = CAPTURE_W;
  canvas.height = CAPTURE_H;

  const stripH = Math.round(CAPTURE_H * 0.18);
  const mainH = CAPTURE_H - stripH;

  let running = true;
  let rafId = 0;
  let lastFrameAt = 0;
  const frameIntervalMs = 1000 / fps;

  const collectVideos = () => {
    const main = stage.querySelector<HTMLVideoElement>('[data-live-video="main"]');
    const thumbs = Array.from(stage.querySelectorAll<HTMLVideoElement>('[data-live-video="thumb"]'));
    return { main, thumbs };
  };

  const drawVideo = (el: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!el.videoWidth || !el.videoHeight) return;
    try {
      ctx.drawImage(el, x, y, w, h);
    } catch {
      /* tainted / not ready */
    }
  };

  const stream = canvas.captureStream(fps) as MediaStream & CaptureRelease;

  const drawFrame = () => {
    if (!running) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H);

    const { main, thumbs } = collectVideos();
    if (main) drawVideo(main, 0, 0, CAPTURE_W, mainH);

    if (thumbs.length) {
      const pad = 8;
      const tileW = Math.floor((CAPTURE_W - pad * (thumbs.length + 1)) / thumbs.length);
      thumbs.forEach((el, i) => {
        const x = pad + i * (tileW + pad);
        drawVideo(el, x, mainH + pad, tileW, stripH - pad * 2);
      });
    }

    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    track.requestFrame?.();
  };

  const tick = (now: number) => {
    if (!running) return;
    if (now - lastFrameAt >= frameIntervalMs) {
      lastFrameAt = now;
      drawFrame();
    }
    rafId = requestAnimationFrame(tick);
  };

  drawFrame();
  rafId = requestAnimationFrame(tick);

  stream.release = () => {
    running = false;
    cancelAnimationFrame(rafId);
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  };

  const track = stream.getVideoTracks()[0];
  if (track) {
    track.addEventListener("ended", () => stream.release?.(), { once: true });
  }

  return stream;
}

/** Захват сцены эфира только через canvas (безопасно для WebRTC). */
export function getStageCaptureStream(stage: HTMLElement, fps = 30): (MediaStream & CaptureRelease) | null {
  return startCanvasStageCapture(stage, fps);
}

export function releaseStageCaptureStream(stream: MediaStream | null) {
  if (!stream) return;
  const s = stream as MediaStream & CaptureRelease;
  s.release?.();
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

export class LiveRecordingAudioMixer {
  private readonly ctx: AudioContext;
  private readonly dest: MediaStreamAudioDestinationNode;
  private readonly sources = new Map<string, MediaStreamAudioSourceNode>();

  constructor() {
    this.ctx = new AudioContext();
    this.dest = this.ctx.createMediaStreamDestination();
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  sync(opts: { local: MediaStream | null; remoteAudios: MediaStream[] }) {
    const want = new Set<string>();

    const attach = (stream: MediaStream) => {
      for (const track of stream.getAudioTracks()) {
        if (track.readyState === "ended") continue;
        want.add(track.id);
        if (!this.sources.has(track.id)) {
          const src = this.ctx.createMediaStreamSource(new MediaStream([track]));
          src.connect(this.dest);
          this.sources.set(track.id, src);
        }
      }
    };

    if (opts.local) attach(opts.local);
    for (const s of opts.remoteAudios) attach(s);

    for (const [id, node] of this.sources) {
      if (!want.has(id)) {
        try {
          node.disconnect();
        } catch {
          /* ignore */
        }
        this.sources.delete(id);
      }
    }
  }

  getMixedStream(): MediaStream {
    return this.dest.stream;
  }

  close() {
    for (const node of this.sources.values()) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sources.clear();
    this.ctx.close().catch(() => {});
  }
}

export function buildRecorderOutputStream(video: MediaStream, audio: MediaStream): MediaStream {
  const v = video.getVideoTracks();
  const a = audio.getAudioTracks();
  return new MediaStream([...v, ...a]);
}
