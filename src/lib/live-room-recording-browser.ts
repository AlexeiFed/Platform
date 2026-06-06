/** Только импорт из client-компонентов (MediaRecorder, AudioContext). */

export type RecordingFormat = "webm" | "mp4";

const MP4_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
] as const;

const WEBM_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** MP4 в приоритете — воспроизводится на iOS, Android и desktop. */
export function pickRecordingFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of MP4_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return "mp4";
  }
  for (const t of WEBM_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return "webm";
  }
  return null;
}

export function pickRecorderMime(format: RecordingFormat): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const order = format === "mp4" ? MP4_MIME_CANDIDATES : WEBM_MIME_CANDIDATES;
  for (const t of order) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

const CAPTURE_W = 1280;
const CAPTURE_H = 720;

export type RecordingLayoutSource = {
  /** Крупный кадр (у ведущего — своя камера) */
  main: MediaStream | null;
  /** Превью участников */
  thumbs: MediaStream[];
  localAudio: MediaStream | null;
  remoteAudios: MediaStream[];
};

export function buildHostRecordingSources(
  local: MediaStream | null,
  remoteTracks: Array<{ userId: string; kind: "audio" | "video"; stream: MediaStream }>,
  selfUserId: string | null
): RecordingLayoutSource {
  const notSelf = (userId: string) => userId !== selfUserId;
  return {
    main: local,
    thumbs: remoteTracks.filter((t) => t.kind === "video" && notSelf(t.userId)).map((t) => t.stream),
    localAudio: local,
    remoteAudios: remoteTracks.filter((t) => t.kind === "audio" && notSelf(t.userId)).map((t) => t.stream),
  };
}

function drawVideoContain(
  ctx: CanvasRenderingContext2D,
  el: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const vw = el.videoWidth;
  const vh = el.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.min(dw / vw, dh / vh);
  const sw = vw * scale;
  const sh = vh * scale;
  const x = dx + (dw - sw) / 2;
  const y = dy + (dh - sh) / 2;
  try {
    ctx.drawImage(el, x, y, sw, sh);
  } catch {
    /* not ready */
  }
}

/**
 * Второй `<video>` на том же MediaStream, что и превью — без `track.clone()`.
 * Клон WebRTC-трека в Chrome часто гасит декодирование на основном превью;
 * два элемента с одним stream обычно стабильны для drawImage/capture.
 */
async function waitForVideoFrames(el: HTMLVideoElement, timeoutMs = 4000): Promise<boolean> {
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0 && el.videoHeight > 0) {
    return true;
  }

  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("resize", onReady);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) finish(true);
    };
    el.addEventListener("loadeddata", onReady);
    el.addEventListener("resize", onReady);
    const timer = window.setTimeout(() => finish(el.videoWidth > 0 && el.videoHeight > 0), timeoutMs);
    try {
      void el.play();
    } catch {
      /* autoplay */
    }
  });
}

function collectStageVideos(stage: HTMLElement): HTMLVideoElement[] {
  const main = stage.querySelector<HTMLVideoElement>('video[data-live-video="main"]');
  const thumbs = [...stage.querySelectorAll<HTMLVideoElement>('video[data-live-video="thumb"]')];
  const out: HTMLVideoElement[] = [];
  if (main?.srcObject) out.push(main);
  for (const t of thumbs) {
    if (t.srcObject) out.push(t);
  }
  return out;
}

async function spawnHiddenVideo(stream: MediaStream, root: HTMLElement): Promise<HTMLVideoElement | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState === "ended") return null;

  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.width = 640;
  el.height = 360;
  el.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
  el.srcObject = stream;
  root.appendChild(el);

  await waitForVideoFrames(el);
  return el.videoWidth > 0 ? el : null;
}

export class LiveRecordingAudioMixer {
  private readonly ctx: AudioContext;
  private readonly dest: MediaStreamAudioDestinationNode;
  private readonly sources = new Map<string, MediaStreamAudioSourceNode>();
  private readonly clonedTracks: MediaStreamTrack[] = [];

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
        const key = track.id;
        want.add(key);
        if (this.sources.has(key)) continue;

        const clone = track.clone();
        this.clonedTracks.push(clone);
        const src = this.ctx.createMediaStreamSource(new MediaStream([clone]));
        src.connect(this.dest);
        this.sources.set(key, src);
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
    for (const t of this.clonedTracks) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    this.clonedTracks.length = 0;
    this.ctx.close().catch(() => {});
  }
}

/** Запись через скрытые `<video>` на тех же MediaStream, что и превью (без clone видеотрека). */
export class LiveStageRecorder {
  private readonly hiddenRoot: HTMLDivElement;
  private readonly hiddenVideos: HTMLVideoElement[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly videoStream: MediaStream;
  private readonly mixer: LiveRecordingAudioMixer;
  private running = true;
  private rafId = 0;
  private lastFrameAt = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    videoStream: MediaStream,
    mixer: LiveRecordingAudioMixer,
    hiddenRoot: HTMLDivElement,
    hiddenVideos: HTMLVideoElement[],
    fps: number
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.videoStream = videoStream;
    this.mixer = mixer;
    this.hiddenRoot = hiddenRoot;
    this.hiddenVideos = hiddenVideos;

    const frameIntervalMs = 1000 / fps;
    const mainVideos = hiddenVideos.slice(0, 1);
    const thumbVideos = hiddenVideos.slice(1);
    const stripH = Math.round(CAPTURE_H * 0.18);
    const mainH = CAPTURE_H - (thumbVideos.length ? stripH : 0);

    const drawFrame = () => {
      if (!this.running) return;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H);

      if (mainVideos[0]) {
        drawVideoContain(ctx, mainVideos[0], 0, 0, CAPTURE_W, mainH);
      }

      if (thumbVideos.length) {
        const pad = 8;
        const tileW = Math.floor((CAPTURE_W - pad * (thumbVideos.length + 1)) / thumbVideos.length);
        thumbVideos.forEach((el, i) => {
          const x = pad + i * (tileW + pad);
          drawVideoContain(ctx, el, x, mainH + pad, tileW, stripH - pad * 2);
        });
      }

      const track = videoStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
      track.requestFrame?.();
    };

    const tick = (now: number) => {
      if (!this.running) return;
      if (now - this.lastFrameAt >= frameIntervalMs) {
        this.lastFrameAt = now;
        drawFrame();
      }
      this.rafId = requestAnimationFrame(tick);
    };

    drawFrame();
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Захват с уже отрисовываемых `<video>` на сцене эфира — стабильнее, чем off-screen клоны.
   */
  static async createFromStage(
    stage: HTMLElement,
    sources: RecordingLayoutSource,
    fps = 30
  ): Promise<LiveStageRecorder | null> {
    const stageVideos = collectStageVideos(stage);
    for (const v of stageVideos) {
      await waitForVideoFrames(v);
    }
    const readyStageVideos = stageVideos.filter((v) => v.videoWidth > 0 && v.videoHeight > 0);
    if (readyStageVideos.length) {
      return LiveStageRecorder.createWithVideos(sources, readyStageVideos, fps, null);
    }
    return LiveStageRecorder.create(sources, fps);
  }

  static async create(sources: RecordingLayoutSource, fps = 30): Promise<LiveStageRecorder | null> {
    const hiddenRoot = document.createElement("div");
    hiddenRoot.setAttribute("aria-hidden", "true");
    hiddenRoot.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(hiddenRoot);

    const hiddenVideos: HTMLVideoElement[] = [];

    try {
      if (sources.main) {
        const main = await spawnHiddenVideo(sources.main, hiddenRoot);
        if (main) hiddenVideos.push(main);
      }
      for (const thumb of sources.thumbs) {
        const el = await spawnHiddenVideo(thumb, hiddenRoot);
        if (el) hiddenVideos.push(el);
      }

      if (!hiddenVideos.length) {
        throw new Error("no video sources");
      }

      return LiveStageRecorder.createWithVideos(sources, hiddenVideos, fps, hiddenRoot);
    } catch (e) {
      console.error("[LiveStageRecorder.create]", e);
      hiddenRoot.remove();
      return null;
    }
  }

  private static async createWithVideos(
    sources: RecordingLayoutSource,
    captureVideos: HTMLVideoElement[],
    fps: number,
    hiddenRoot: HTMLDivElement | null
  ): Promise<LiveStageRecorder | null> {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("no canvas ctx");

      canvas.width = CAPTURE_W;
      canvas.height = CAPTURE_H;
      const videoStream = canvas.captureStream(fps);

      const mixer = new LiveRecordingAudioMixer();
      await mixer.resume();
      mixer.sync({ local: sources.localAudio, remoteAudios: sources.remoteAudios });

      const root =
        hiddenRoot ??
        (() => {
          const el = document.createElement("div");
          el.setAttribute("aria-hidden", "true");
          return el;
        })();

      return new LiveStageRecorder(canvas, ctx, videoStream, mixer, root, captureVideos, fps);
    } catch (e) {
      console.error("[LiveStageRecorder.createWithVideos]", e);
      hiddenRoot?.remove();
      return null;
    }
  }

  syncAudio(sources: Pick<RecordingLayoutSource, "localAudio" | "remoteAudios">) {
    this.mixer.sync({ local: sources.localAudio, remoteAudios: sources.remoteAudios });
  }

  getCombinedStream(): MediaStream {
    const a = this.mixer.getMixedStream().getAudioTracks();
    const v = this.videoStream.getVideoTracks();
    return new MediaStream([...v, ...a]);
  }

  release() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.videoStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    this.mixer.close();
    if (this.hiddenRoot.isConnected) {
      this.hiddenVideos.forEach((v) => {
        if (v.parentElement === this.hiddenRoot) v.remove();
      });
      this.hiddenRoot.remove();
    }
    this.hiddenVideos.length = 0;
  }
}

/** @deprecated используйте LiveStageRecorder */
export function getStageCaptureStream(_stage: HTMLElement, _fps = 30) {
  return null;
}

export function releaseStageCaptureStream(_stream: MediaStream | null) {
  /* noop — release через LiveStageRecorder.release() */
}

export function buildRecorderOutputStream(video: MediaStream, audio: MediaStream): MediaStream {
  const v = video.getVideoTracks();
  const a = audio.getAudioTracks();
  return new MediaStream([...v, ...a]);
}

/** Дождаться финальных чанков MediaRecorder перед сборкой Blob. */
export function flushMediaRecorder(recorder: MediaRecorder, chunks: Blob[], mimeFallback: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (recorder.state === "inactive") {
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeFallback }));
      return;
    }

    const onData = (ev: BlobEvent) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const onStop = () => {
      recorder.removeEventListener("dataavailable", onData);
      window.setTimeout(() => {
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeFallback }));
      }, 300);
    };

    recorder.addEventListener("dataavailable", onData);
    recorder.addEventListener("stop", onStop, { once: true });

    try {
      if (recorder.state === "recording") {
        recorder.requestData();
      }
      recorder.stop();
    } catch (e) {
      recorder.removeEventListener("dataavailable", onData);
      reject(e);
    }
  });
}
