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

function videoCaptureStream(video: HTMLVideoElement, fps: number): MediaStream | null {
  const v = video as HTMLVideoElement & {
    captureStream?: (n?: number) => MediaStream;
    mozCaptureStream?: (n?: number) => MediaStream;
  };
  const fn = v.captureStream ?? v.mozCaptureStream;
  if (typeof fn !== "function") return null;
  try {
    return fn.call(v, fps);
  } catch {
    return null;
  }
}

function tryElementCaptureStream(el: HTMLElement, fps: number): MediaStream | null {
  const node = el as HTMLElement & { captureStream?: (n?: number) => MediaStream };
  if (typeof node.captureStream !== "function") return null;
  try {
    const stream = node.captureStream(fps);
    return stream.getVideoTracks().length ? stream : null;
  } catch {
    return null;
  }
}

function startCanvasStageCapture(stage: HTMLElement, fps: number): (MediaStream & CaptureRelease) | null {
  const main =
    stage.querySelector<HTMLVideoElement>('[data-live-video="main"]') ??
    stage.querySelector<HTMLVideoElement>("video");
  const thumbs = Array.from(stage.querySelectorAll<HTMLVideoElement>('[data-live-video="thumb"]'));
  if (!main && thumbs.length === 0) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const width = 1280;
  const height = 720;
  canvas.width = width;
  canvas.height = height;

  const stripH = Math.round(height * 0.18);
  const mainH = height - stripH;

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const drawVideo = (el: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
      if (el.readyState < 2) return;
      try {
        ctx.drawImage(el, x, y, w, h);
      } catch {
        /* cross-origin / not ready */
      }
    };

    if (main) drawVideo(main, 0, 0, width, mainH);

    const stripVideos = thumbs.length ? thumbs : [];
    if (stripVideos.length) {
      const pad = 8;
      const tileW = Math.floor((width - pad * (stripVideos.length + 1)) / stripVideos.length);
      stripVideos.forEach((el, i) => {
        const x = pad + i * (tileW + pad);
        drawVideo(el, x, mainH + pad, tileW, stripH - pad * 2);
      });
    }
  };

  draw();
  const interval = window.setInterval(draw, Math.max(16, Math.round(1000 / fps)));

  const stream = canvas.captureStream(fps) as MediaStream & CaptureRelease;
  stream.release = () => {
    window.clearInterval(interval);
    stream.getTracks().forEach((t) => t.stop());
  };

  const track = stream.getVideoTracks()[0];
  if (track) {
    track.addEventListener("ended", () => stream.release?.(), { once: true });
  }

  return stream;
}

/** Захват сцены эфира: div.captureStream редко работает — canvas / video fallback. */
export function getStageCaptureStream(stage: HTMLElement, fps = 15): (MediaStream & CaptureRelease) | null {
  const fromStage = tryElementCaptureStream(stage, fps);
  if (fromStage) return fromStage as MediaStream & CaptureRelease;

  const main = stage.querySelector<HTMLVideoElement>('[data-live-video="main"]');
  if (main) {
    const fromMain = videoCaptureStream(main, fps);
    if (fromMain?.getVideoTracks().length) return fromMain as MediaStream & CaptureRelease;
  }

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
