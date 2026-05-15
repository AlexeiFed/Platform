"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { failLiveRoomRecording, finishLiveRoomRecording, startLiveRoomRecording } from "@/lib/live-recording-actions";
import {
  LiveRecordingAudioMixer,
  buildRecorderOutputStream,
  getStageCaptureStream,
  releaseStageCaptureStream,
  pickRecorderMime,
  pickRecordingFormat,
  type RecordingFormat,
} from "@/lib/live-room-recording-browser";

const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;

type RemoteTrackLite = {
  id: string;
  userId: string;
  kind: "audio" | "video";
  stream: MediaStream;
};

type Props = {
  eventId: string;
  liveConnected: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  localStreamRef: RefObject<MediaStream | null>;
  remoteTracks: RemoteTrackLite[];
  selfUserId: string | null;
};

export function LiveHostRecordingControls({
  eventId,
  liveConnected,
  stageRef,
  localStreamRef,
  remoteTracks,
  selfUserId,
}: Props) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading">("idle");
  const [recError, setRecError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const mixerRef = useRef<LiveRecordingAudioMixer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<{
    recordingId: string;
    format: RecordingFormat;
    contentType: string;
    uploadUrl: string;
    startedAt: number;
  } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageCapRef = useRef<MediaStream | null>(null);

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const cleanupCapture = () => {
    releaseStageCaptureStream(stageCapRef.current);
    stageCapRef.current = null;
  };

  const syncMixer = useCallback(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    const remoteAudios = remoteTracks
      .filter((t) => t.kind === "audio" && t.userId !== selfUserId)
      .map((t) => t.stream);
    mixer.sync({
      local: localStreamRef.current,
      remoteAudios,
    });
  }, [remoteTracks, selfUserId, localStreamRef]);

  useEffect(() => {
    if (phase !== "recording") return;
    syncMixer();
  }, [phase, syncMixer]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    const mixer = mixerRef.current;
    const session = sessionRef.current;
    if (!rec || !session) {
      setPhase("idle");
      stopTick();
      return;
    }

    setPhase("uploading");
    stopTick();

    rec.addEventListener(
      "stop",
      () => {
        void (async () => {
          await new Promise((r) => setTimeout(r, 120));
          const chunks = chunksRef.current;
          const blob = new Blob(chunks, { type: rec.mimeType || session.contentType });
          chunksRef.current = [];
          recorderRef.current = null;
          mixer?.close();
          mixerRef.current = null;

          if (blob.size > MAX_RECORDING_BYTES || !session.contentType.startsWith("video/")) {
            setRecError("Файл записи слишком большой или некорректный тип");
            await failLiveRoomRecording(eventId, session.recordingId, "Превышен размер файла");
            sessionRef.current = null;
            cleanupCapture();
            setPhase("idle");
            return;
          }

          try {
            const put = await fetch(session.uploadUrl, {
              method: "PUT",
              body: blob,
              headers: { "Content-Type": session.contentType },
            });
            if (!put.ok) {
              throw new Error(`S3 ${put.status}`);
            }
          } catch (e) {
            console.error("[recording upload]", e);
            setRecError("Не удалось загрузить запись в S3");
            await failLiveRoomRecording(eventId, session.recordingId, "Ошибка загрузки в S3");
            sessionRef.current = null;
            cleanupCapture();
            setPhase("idle");
            return;
          }

          const durationSec = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
          const fin = await finishLiveRoomRecording(eventId, session.recordingId, {
            format: session.format,
            sizeBytes: blob.size,
            durationSec,
          });
          sessionRef.current = null;
          cleanupCapture();

          if (fin && "error" in fin && fin.error) {
            setRecError(fin.error);
          } else {
            setRecError(null);
            router.refresh();
          }
          setPhase("idle");
        })();
      },
      { once: true }
    );

    try {
      rec.stop();
    } catch (e) {
      console.error("[recorder stop]", e);
      void failLiveRoomRecording(eventId, session.recordingId, "Ошибка остановки записи");
      mixer?.close();
      mixerRef.current = null;
      sessionRef.current = null;
      cleanupCapture();
      setPhase("idle");
    }
  }, [eventId, router]);

  const startRecording = async () => {
    setRecError(null);
    const stage = stageRef.current;
    if (!stage) {
      setRecError("Нет области эфира для захвата");
      return;
    }

    const format = pickRecordingFormat();
    if (!format) {
      setRecError("Браузер не поддерживает запись (MediaRecorder)");
      return;
    }

    const mime = pickRecorderMime(format);
    if (!mime) {
      setRecError("Не удалось выбрать кодек записи");
      return;
    }

    setIsStarting(true);
    try {
      const started = await startLiveRoomRecording(eventId, format);
      if (!started.success || !("data" in started)) {
        setRecError("error" in started ? started.error : "Ошибка старта");
        return;
      }

      const { recordingId, uploadUrl, contentType } = started.data;

      const mixer = new LiveRecordingAudioMixer();
      mixerRef.current = mixer;
      try {
        await mixer.resume();
      } catch (e) {
        console.error("[mixer resume]", e);
        mixer.close();
        mixerRef.current = null;
        await failLiveRoomRecording(eventId, recordingId, "AudioContext не запущен");
        setRecError("Не удалось запустить аудио-контекст");
        return;
      }

      const remoteAudios = remoteTracks
        .filter((t) => t.kind === "audio" && t.userId !== selfUserId)
        .map((t) => t.stream);
      mixer.sync({ local: localStreamRef.current, remoteAudios });

      const stageCap = getStageCaptureStream(stage);
      if (!stageCap || !stageCap.getVideoTracks().length) {
        mixer.close();
        mixerRef.current = null;
        await failLiveRoomRecording(eventId, recordingId, "captureStream недоступен");
        setRecError("Не удалось захватить видео сцены. Проверьте, что эфир на экране, и попробуйте Chrome на десктопе.");
        return;
      }
      stageCapRef.current = stageCap;

      const combined = buildRecorderOutputStream(stageCap, mixer.getMixedStream());
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combined, {
          mimeType: mime,
          videoBitsPerSecond: 2_500_000,
          audioBitsPerSecond: 128_000,
        });
      } catch (e) {
        console.error("[MediaRecorder]", e);
        cleanupCapture();
        mixer.close();
        mixerRef.current = null;
        await failLiveRoomRecording(eventId, recordingId, "MediaRecorder не создан");
        setRecError("Не удалось создать MediaRecorder");
        return;
      }

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = (ev) => {
        console.error("[MediaRecorder error]", ev);
        setRecError("Ошибка записи (MediaRecorder)");
      };

      const videoTrack = combined.getVideoTracks()[0];
      videoTrack?.addEventListener("ended", () => {
        console.error("[recording] video track ended");
        if (recorderRef.current?.state === "recording") {
          setRecError("Видеопоток записи прервался");
          stopRecording();
        }
      });

      recorderRef.current = recorder;
      sessionRef.current = {
        recordingId,
        format,
        contentType,
        uploadUrl,
        startedAt: Date.now(),
      };

      try {
        recorder.start(1000);
      } catch (e) {
        console.error("[recorder start]", e);
        cleanupCapture();
        mixer.close();
        mixerRef.current = null;
        recorderRef.current = null;
        sessionRef.current = null;
        await failLiveRoomRecording(eventId, recordingId, "Не удалось начать запись");
        setRecError("Не удалось начать запись");
        return;
      }

      setElapsedSec(0);
      tickRef.current = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
      setPhase("recording");
    } catch (e) {
      console.error("[startRecording]", e);
      setRecError("Не удалось начать запись");
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopTick();
      const sess = sessionRef.current;
      const rec = recorderRef.current;
      if (rec?.state === "recording" && sess) {
        try {
          rec.ondataavailable = null;
          rec.onstop = null;
          rec.stop();
        } catch {
          /* ignore */
        }
        void failLiveRoomRecording(eventId, sess.recordingId, "Запись прервана (уход со страницы)");
        sessionRef.current = null;
        chunksRef.current = [];
      } else if (rec?.state === "recording") {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null;
      mixerRef.current?.close();
      mixerRef.current = null;
      cleanupCapture();
    };
  }, [eventId]);

  const disabled = !liveConnected || isStarting || phase === "uploading";

  return (
    <div className="space-y-2">
      <div className={cn(tokens.typography.small, "text-muted-foreground")}>
        Запись: область «Эфир» (ведущий и превью участников) и звук с твоего микрофона и участников.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" ? (
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={startRecording}>
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4 fill-red-500 text-red-500" />}
            <span className="ml-2">Начать запись</span>
          </Button>
        ) : phase === "recording" ? (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
            Остановить и сохранить
            <span className="ml-2 tabular-nums text-xs opacity-90">
              {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
            </span>
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2">Загрузка в S3…</span>
          </Button>
        )}
      </div>
      {recError ? <div className="text-sm text-destructive">{recError}</div> : null}
    </div>
  );
}
