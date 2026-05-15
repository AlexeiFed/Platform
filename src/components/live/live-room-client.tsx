"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import type { Device as MediasoupDevice } from "mediasoup-client";
import { Device } from "mediasoup-client";
import { Mic, MicOff, Video, VideoOff, VolumeX, Maximize2, Minimize2 } from "lucide-react";
import { endLiveRoom } from "@/lib/live-room-actions";
import { LiveHostRecordingControls } from "@/components/live/live-host-recording-controls";
import { cn } from "@/lib/utils";

type ServerAck<T> = { ok: true; data: T } | { ok: false; error: string };

type Props = {
  liveServerUrl: string;
  token: string;
  role: "HOST" | "SPEAKER" | "VIEWER";
  marathonEventId?: string;
  afterEndRedirectHref?: string;
};

type RemoteTrack = {
  id: string;
  producerId: string;
  userId: string;
  kind: "audio" | "video";
  stream: MediaStream;
};

type PeerRow = {
  userId: string;
  role: "HOST" | "SPEAKER" | "VIEWER";
  name: string | null;
};

function decodeJwtPayload(token: string): any | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function initials(name: string | null) {
  const raw = (name ?? "").trim();
  if (!raw) return "U";
  const parts = raw.split(/\s+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return (a + (b ?? "")).toUpperCase();
}

export function LiveRoomClient({
  liveServerUrl,
  token,
  role,
  marathonEventId,
  afterEndRedirectHref,
}: Props) {
  const router = useRouter();
  const isHost = role === "HOST";
  const canProduce = true; // все с аудио/видео; микрофон по умолчанию включаем при входе
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState("");
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [isPending, startTransition] = useTransition();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [peers, setPeers] = useState<PeerRow[]>([]);
  const [producerMuted, setProducerMuted] = useState<Record<string, boolean>>({});
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  const [stageExpanded, setStageExpanded] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mainDisplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const deviceRef = useRef<MediasoupDevice | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfThumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<any>(null);
  const videoProducerRef = useRef<any>(null);

  const syncStageFs = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const fs = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    setStageExpanded(fs === stageRef.current);
  };

  useEffect(() => {
    document.addEventListener("fullscreenchange", syncStageFs);
    document.addEventListener("webkitfullscreenchange", syncStageFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", syncStageFs);
      document.removeEventListener("webkitfullscreenchange", syncStageFs as EventListener);
    };
  }, []);

  const toggleStageFullscreen = async () => {
    const stage = stageRef.current;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const nativeFs = (document.fullscreenElement ?? doc.webkitFullscreenElement) === stage;

    if (stageExpanded) {
      if (nativeFs) {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else doc.webkitExitFullscreen?.();
        } catch {
          /* ignore */
        }
      }
      setStageExpanded(false);
      return;
    }

    if (!stage) return;

    try {
      const webkitStage = stage as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (stage.requestFullscreen) {
        await stage.requestFullscreen();
        return;
      }
      if (webkitStage.webkitRequestFullscreen) {
        webkitStage.webkitRequestFullscreen();
        return;
      }
    } catch {
      /* CSS pseudo-fullscreen (iOS и др.) */
    }

    setStageExpanded(true);
  };

  const label = useMemo(() => (isHost ? "Ведущий" : "Участник"), [isHost]);
  const decoded = useMemo(() => decodeJwtPayload(token) as { userId?: string; roomId?: string } | null, [token]);
  const selfUserId = decoded?.userId ? String(decoded.userId) : null;
  const selfRoomId = decoded?.roomId ? String(decoded.roomId) : null;
  const hostPeer = useMemo(() => peers.find((p) => p.role === "HOST") ?? null, [peers]);
  const hostUserId = hostPeer?.userId ?? null;
  const hostVideo = useMemo(() => {
    if (!hostUserId) return null;
    return remoteTracks.find((t) => t.userId === hostUserId && t.kind === "video") ?? null;
  }, [remoteTracks, hostUserId]);

  useEffect(() => {
    let alive = true;
    const pendingProducers: Array<{ producerId: string; userId: string; kind?: string; paused?: boolean }> = [];
    const drainPending = async () => {
      const socket = socketRef.current;
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      if (!socket || !device || !recvTransport) return;
      const items = pendingProducers.splice(0, pendingProducers.length);
      for (const p of items) {
        if (!p.producerId || !p.userId) continue;
        if (p.kind === "audio" && typeof p.paused === "boolean") {
          setProducerMuted((prev) => ({ ...prev, [String(p.producerId)]: Boolean(p.paused) }));
        }
        // consumeProducer defined below, but we can re-enqueue by emitting newProducer-style event
        // We'll call socket.emit consume directly after transports are ready via helper.
        try {
          const res = await new Promise<ServerAck<any>>((resolve) => {
            socket.emit(
              "consume",
              { transportId: recvTransport.id, producerId: p.producerId, rtpCapabilities: device.rtpCapabilities },
              resolve
            );
          });
          if (!res.ok) continue;
          const consumer = await recvTransport.consume({
            id: res.data.id,
            producerId: res.data.producerId,
            kind: res.data.kind,
            rtpParameters: res.data.rtpParameters,
          });
          const stream = new MediaStream([consumer.track]);
          setRemoteTracks((prev) => [
            ...prev,
            { id: consumer.id, producerId: res.data.producerId, userId: p.userId, kind: consumer.kind, stream },
          ]);
          socket.emit("resumeConsumer", { consumerId: consumer.id }, () => {});
        } catch {}
      }
    };

    const run = async () => {
      try {
        const socket = io(liveServerUrl, {
          transports: ["websocket"],
          path: "/live/socket.io",
          auth: { token },
        });
        socketRef.current = socket;

        socket.on("connect_error", (e: any) => {
          if (!alive) return;
          setStatus("error");
          setError(e?.message ?? "Ошибка подключения");
        });

        // Register listeners ASAP (server can emit peers/existingProducers immediately).
        socket.on("existingProducers", ({ producers }: any) => {
          if (!Array.isArray(producers)) return;
          for (const p of producers) {
            if (p?.producerId && p?.userId) {
              pendingProducers.push({
                producerId: String(p.producerId),
                userId: String(p.userId),
                kind: typeof p.kind === "string" ? p.kind : undefined,
                paused: typeof p.paused === "boolean" ? Boolean(p.paused) : undefined,
              });
            }
          }
          drainPending().catch(() => {});
        });
        socket.on("newProducer", ({ producerId, userId, kind }: any) => {
          if (!producerId || !userId) return;
          pendingProducers.push({
            producerId: String(producerId),
            userId: String(userId),
            kind: typeof kind === "string" ? kind : undefined,
          });
          drainPending().catch(() => {});
        });
        socket.on("peers", ({ peers }: any) => {
          if (!Array.isArray(peers)) return;
          setPeers(
            peers
              .map((p) => ({
                userId: String(p.userId),
                role: p.role as PeerRow["role"],
                name: typeof p.name === "string" ? p.name : null,
              }))
              .filter((p) => p.userId && (p.role === "HOST" || p.role === "SPEAKER" || p.role === "VIEWER"))
          );
        });
        socket.on("peerJoined", (p: any) => {
          const row: PeerRow = {
            userId: String(p?.userId ?? ""),
            role: p?.role,
            name: typeof p?.name === "string" ? p.name : null,
          };
          if (!row.userId) return;
          if (row.role !== "HOST" && row.role !== "SPEAKER" && row.role !== "VIEWER") return;
          setPeers((prev) => (prev.some((x) => x.userId === row.userId) ? prev : [...prev, row]));
        });
        socket.on("peerLeft", ({ userId }: any) => {
          const id = String(userId ?? "");
          if (!id) return;
          setPeers((prev) => prev.filter((p) => p.userId !== id));
          setRemoteTracks((prev) => prev.filter((t) => t.userId !== id));
        });
        socket.on("producerClosed", ({ producerId }: any) => {
          setRemoteTracks((prev) => prev.filter((t) => t.producerId !== producerId));
          setProducerMuted((prev) => {
            const next = { ...prev };
            delete next[String(producerId)];
            return next;
          });
        });
        socket.on("producerMuted", ({ producerId, muted }: any) => {
          if (!producerId) return;
          setProducerMuted((prev) => ({ ...prev, [String(producerId)]: Boolean(muted) }));
        });

        const routerCaps: any = await new Promise((resolve) => socket.once("routerRtpCapabilities", resolve));

        const device = new Device();
        await device.load({ routerRtpCapabilities: routerCaps });
        deviceRef.current = device;

        const recvTransportParams = await new Promise<ServerAck<any>>((resolve) => {
          socket.emit("createWebRtcTransport", {}, resolve);
        });
        if (!recvTransportParams.ok) throw new Error(recvTransportParams.error);
        const recvTransport = device.createRecvTransport(recvTransportParams.data);
        recvTransportRef.current = recvTransport;
        recvTransport.on("connect", ({ dtlsParameters }: any, cb: any, errCb: any) => {
          socket.emit("connectTransport", { transportId: recvTransport.id, dtlsParameters }, (res: ServerAck<unknown>) => {
            if (!res.ok) errCb(new Error(res.error));
            else cb();
          });
        });

        await drainPending();

        if (canProduce) {
          const sendTransportParams = await new Promise<ServerAck<any>>((resolve) => {
            socket.emit("createWebRtcTransport", {}, resolve);
          });
          if (!sendTransportParams.ok) throw new Error(sendTransportParams.error);
          const sendTransport = device.createSendTransport(sendTransportParams.data);
          sendTransportRef.current = sendTransport;
          sendTransport.on("connect", ({ dtlsParameters }: any, cb: any, errCb: any) => {
            socket.emit("connectTransport", { transportId: sendTransport.id, dtlsParameters }, (res: ServerAck<unknown>) => {
              if (!res.ok) errCb(new Error(res.error));
              else cb();
            });
          });
          sendTransport.on("produce", ({ kind, rtpParameters, appData }: any, cb: any, errCb: any) => {
            socket.emit(
              "produce",
              { transportId: sendTransport.id, kind, rtpParameters, appData },
              (res: ServerAck<{ id: string }>) => {
                if (!res.ok) errCb(new Error(res.error));
                else cb({ id: res.data.id });
              }
            );
          });

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
            if (selfThumbVideoRef.current) {
              selfThumbVideoRef.current.srcObject = stream;
              selfThumbVideoRef.current.play?.().catch(() => {});
            }
            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];
            if (audioTrack) {
              const initialMicOn = true;
              audioTrack.enabled = initialMicOn;
              const p = await sendTransport.produce({ track: audioTrack, appData: { kind: "audio" } });
              audioProducerRef.current = p;
              setMicOn(initialMicOn);
            }
            if (videoTrack) {
              videoTrack.enabled = true;
              const p = await sendTransport.produce({ track: videoTrack, appData: { kind: "video" } });
              videoProducerRef.current = p;
              setCamOn(true);
            }
          } catch (e: any) {
            setError(e?.message ?? "Не удалось получить доступ к камере/микрофону");
          }
        }

        if (!alive) return;
        setStatus("connected");
      } catch (e: any) {
        if (!alive) return;
        setStatus("error");
        setError(e?.message ?? "Ошибка эфира");
      }
    };

    run();

    return () => {
      alive = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      try {
        sendTransportRef.current?.close?.();
        recvTransportRef.current?.close?.();
      } catch {}
      try {
        localStreamRef.current?.getTracks()?.forEach((t) => t.stop());
      } catch {}
    };
  }, [liveServerUrl, token, canProduce, role]);

  const notifyPlayBlocked = useCallback(() => setNeedsAudioGesture(true), []);

  const remoteAudioCount = useMemo(
    () => remoteTracks.filter((t) => t.kind === "audio" && t.userId !== selfUserId).length,
    [remoteTracks, selfUserId]
  );

  const tryEnableAudio = useCallback(() => {
    try {
      const els = Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[];
      Promise.allSettled(els.map((a) => a.play())).then((res) => {
        const anyRejected = res.some((r) => r.status === "rejected");
        setNeedsAudioGesture(anyRejected);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (status !== "connected" || remoteAudioCount === 0) return;
    tryEnableAudio();
  }, [status, remoteAudioCount, tryEnableAudio]);

  const retry = () => {
    startTransition(() => {
      window.location.reload();
    });
  };

  const confirmEndBroadcast = () => {
    if (!marathonEventId || !confirm("Завершить эфир для этого события? Повторный вход будет недоступен.")) return;
    startTransition(async () => {
      const res = await endLiveRoom(marathonEventId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      try {
        socketRef.current?.disconnect();
      } catch {}
      if (afterEndRedirectHref) router.push(afterEndRedirectHref);
      else router.refresh();
    });
  };

  const toggleMic = useCallback(async () => {
    const track = localStreamRef.current?.getAudioTracks?.()?.[0];
    const producer = audioProducerRef.current as {
      pause?: () => Promise<void>;
      resume?: () => Promise<void>;
      paused?: boolean;
    } | null;
    const next = !micOn;
    try {
      if (next) {
        if (track) track.enabled = true;
        if (producer?.resume) await producer.resume();
      } else {
        if (producer?.pause) await producer.pause();
        if (track) track.enabled = false;
      }
      setMicOn(next);
    } catch (e) {
      console.error("[toggleMic]", e);
      setMicOn(Boolean(track?.enabled));
    }
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks?.()?.[0];
    const producer = videoProducerRef.current as {
      pause?: () => Promise<void>;
      resume?: () => Promise<void>;
    } | null;
    const next = !camOn;
    try {
      if (next) {
        if (track) track.enabled = true;
        if (producer?.resume) await producer.resume();
      } else {
        if (producer?.pause) await producer.pause();
        if (track) track.enabled = false;
      }
      setCamOn(next);
    } catch (e) {
      console.error("[toggleCam]", e);
      setCamOn(Boolean(track?.enabled));
    }
  }, [camOn]);

  const filmstripPeers = useMemo(
    () =>
      peers.filter((p) => {
        if (p.userId === selfUserId) return false;
        if (!isHost && p.userId === hostUserId) return false;
        return true;
      }),
    [peers, selfUserId, isHost, hostUserId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "connected" ? "success" : status === "connecting" ? "warning" : "destructive"}>
          {status === "connected" ? "Подключено" : status === "connecting" ? "Подключаемся..." : "Ошибка"}
        </Badge>
        <Badge variant="outline">{label}</Badge>
        {isHost ? <Badge variant="secondary">HOST</Badge> : null}
        {selfRoomId ? <span className="text-xs text-muted-foreground">room: {selfRoomId.slice(0, 8)}…</span> : null}
      </div>

      {error ? (
        <div className="rounded-lg border bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={retry} disabled={isPending}>
              {isPending ? "..." : "Повторить"}
            </Button>
          </div>
        </div>
      ) : null}

      {isHost && marathonEventId ? (
        <LiveHostRecordingControls
          eventId={marathonEventId}
          liveConnected={status === "connected"}
          stageRef={stageRef}
          localStreamRef={localStreamRef}
          remoteTracks={remoteTracks}
          selfUserId={selfUserId}
        />
      ) : null}

      <div className="space-y-2">
        <div className={tokens.typography.h3}>Эфир</div>
        {needsAudioGesture ? (
          <Button type="button" variant="outline" size="sm" onClick={tryEnableAudio}>
            Включить звук
          </Button>
        ) : null}
        <div
          ref={stageRef}
          className={cn(
            "relative flex flex-col overflow-hidden border bg-black",
            stageExpanded ? "fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh] border-0" : cn("rounded-2xl", tokens.radius.lg)
          )}
        >
          <div
            className={cn(
              "relative flex min-h-0 flex-1 w-full items-center justify-center bg-black",
              stageExpanded
                ? "min-h-0 flex-1"
                : "aspect-video max-h-[min(88dvh,100vw)] min-h-[min(48vh,520px)] w-full md:aspect-video md:min-h-0 md:max-h-[min(80vh,920px)]"
            )}
          >
            {isHost ? (
              <video
                ref={(node) => {
                  localVideoRef.current = node;
                  mainDisplayVideoRef.current = node;
                }}
                data-live-video="main"
                className="h-full w-full max-w-full object-cover"
                autoPlay
                playsInline
                muted
              />
            ) : hostVideo ? (
              <RemoteVideo ref={mainDisplayVideoRef} stream={hostVideo.stream} captureTag="main" />
            ) : (
              <div className="flex h-full min-h-[200px] w-full items-center justify-center text-5xl font-semibold text-white/80">
                {initials(hostPeer?.name ?? null)}
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-black/80 p-2 backdrop-blur-sm",
              tokens.radius.md
            )}
          >
            {!isHost ? (
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black">
                <video
                  ref={selfThumbVideoRef}
                  data-live-video="thumb"
                  className="h-full w-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                <div className="absolute inset-x-1 bottom-1">
                  <div className="truncate rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">Вы</div>
                </div>
              </div>
            ) : null}

            {filmstripPeers.map((p) => {
                const video = remoteTracks.find((t) => t.userId === p.userId && t.kind === "video") ?? null;
                const audio = remoteTracks.find((t) => t.userId === p.userId && t.kind === "audio") ?? null;
                const muted = audio ? Boolean(producerMuted[audio.producerId]) : true;
                return (
                  <div key={p.userId} className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black">
                    {video ? (
                      <RemoteVideo stream={video.stream} className="rounded-lg" captureTag="thumb" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-xl font-semibold text-white/80"
                        title="Камера выключена или нет видеопотока"
                      >
                        {initials(p.name)}
                      </div>
                    )}
                    <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                      <div className="truncate rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
                        {p.name ?? p.userId}
                      </div>
                      {isHost ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 bg-black/55 text-white hover:bg-black/70"
                          aria-label={muted ? "Включить микрофон участнику" : "Выключить микрофон участнику"}
                          onClick={() =>
                            socketRef.current?.emit("setUserAudioMuted", { userId: p.userId, muted: !muted }, () => {})
                          }
                        >
                          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </Button>
                      ) : muted ? (
                        <MicOff className="h-3 w-3 shrink-0 text-white/80" aria-hidden />
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-black/90 px-3 py-3 backdrop-blur-sm",
              tokens.radius.md
            )}
          >
            <Button
              type="button"
              size="icon"
              variant={micOn ? "secondary" : "destructive"}
              className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label={micOn ? "Выключить микрофон" : "Включить микрофон"}
              onClick={toggleMic}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant={camOn ? "secondary" : "destructive"}
              className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label={camOn ? "Выключить камеру" : "Включить камеру"}
              onClick={toggleCam}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label={stageExpanded ? "Выйти из полноэкранного режима" : "На весь экран"}
              onClick={() => void toggleStageFullscreen()}
            >
              {stageExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </Button>
            {isHost ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label="Выключить микрофон всем"
                onClick={() => socketRef.current?.emit("setAllAudioMuted", { muted: true }, () => {})}
              >
                <VolumeX className="h-5 w-5" />
              </Button>
            ) : null}
            {isHost && marathonEventId ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="rounded-full px-4"
                disabled={isPending}
                onClick={confirmEndBroadcast}
              >
                {isPending ? "..." : "Завершить"}
              </Button>
            ) : null}
          </div>

        </div>

        {/* Не display:none: иначе браузеры часто не воспроизводят удалённое аудио */}
        <div className="sr-only">
          {remoteTracks
            .filter((t) => t.kind === "audio" && t.userId !== selfUserId)
            .map((t) => (
              <RemoteAudio key={t.id} stream={t.stream} onPlayBlocked={notifyPlayBlocked} />
            ))}
        </div>
      </div>
    </div>
  );
}

const RemoteVideo = forwardRef<
  HTMLVideoElement,
  { stream: MediaStream; className?: string; captureTag?: "main" | "thumb" }
>(function RemoteVideo({ stream, className, captureTag }, ref) {
    const innerRef = useRef<HTMLVideoElement | null>(null);

    const setVid = (el: HTMLVideoElement | null) => {
      innerRef.current = el;
      if (!ref) return;
      if (typeof ref === "function") ref(el);
      else (ref as MutableRefObject<HTMLVideoElement | null>).current = el;
    };

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }, [stream]);

    return (
      <video ref={setVid} data-live-video={captureTag} className={cn("h-full w-full bg-black object-cover", className)} autoPlay playsInline muted />
    );
  }
);

function RemoteAudio({ stream, onPlayBlocked }: { stream: MediaStream; onPlayBlocked?: () => void }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play?.().catch(() => {
      onPlayBlocked?.();
    });
  }, [stream, onPlayBlocked]);
  return <audio ref={ref} autoPlay playsInline className="h-px w-px" />;
}

