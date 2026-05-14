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

export function getStageCaptureStream(stage: HTMLElement, fps = 15): MediaStream | null {
  const el = stage as HTMLElement & { captureStream?: (n?: number) => MediaStream };
  if (typeof el.captureStream !== "function") return null;
  try {
    return el.captureStream(fps);
  } catch {
    return null;
  }
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
