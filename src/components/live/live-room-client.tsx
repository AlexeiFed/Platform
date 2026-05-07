"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import type { Device as MediasoupDevice } from "mediasoup-client";
import { Device } from "mediasoup-client";
import { Mic, MicOff, Video, VideoOff, VolumeX } from "lucide-react";

type ServerAck<T> = { ok: true; data: T } | { ok: false; error: string };

type Props = {
  liveServerUrl: string;
  token: string;
  role: "HOST" | "SPEAKER" | "VIEWER";
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

export function LiveRoomClient({ liveServerUrl, token, role }: Props) {
  const isHost = role === "HOST";
  const canProduce = true; // "как в Zoom": все с видео, у студентов mic off по умолчанию
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState("");
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [isPending, startTransition] = useTransition();
  const [micOn, setMicOn] = useState(role === "HOST");
  const [camOn, setCamOn] = useState(true);
  const [peers, setPeers] = useState<PeerRow[]>([]);
  const [producerMuted, setProducerMuted] = useState<Record<string, boolean>>({});

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<MediasoupDevice | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfThumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<any>(null);
  const videoProducerRef = useRef<any>(null);

  const label = useMemo(() => (isHost ? "Ведущий" : "Участник"), [isHost]);
  const self = useMemo(() => decodeJwtPayload(token) as { userId?: string } | null, [token]);
  const selfUserId = self?.userId ? String(self.userId) : null;
  const selfRoomId = (decodeJwtPayload(token) as any)?.roomId ? String((decodeJwtPayload(token) as any).roomId) : null;
  const hostPeer = useMemo(() => peers.find((p) => p.role === "HOST") ?? null, [peers]);
  const hostUserId = hostPeer?.userId ?? null;
  const hostVideo = useMemo(() => {
    if (!hostUserId) return null;
    return remoteTracks.find((t) => t.userId === hostUserId && t.kind === "video") ?? null;
  }, [remoteTracks, hostUserId]);

  useEffect(() => {
    let alive = true;

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
              // Как в Zoom: у студентов микрофон по умолчанию выключен.
              const initialMicOn = role === "HOST";
              audioTrack.enabled = initialMicOn;
              const p = await sendTransport.produce({ track: audioTrack, appData: { kind: "audio" } });
              audioProducerRef.current = p;
              if (!initialMicOn) {
                try {
                  await p.pause?.();
                } catch {}
              }
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

        const consumeProducer = async (producerId: string, userId: string) => {
          const device = deviceRef.current;
          const recvTransport = recvTransportRef.current;
          if (!device || !recvTransport) return;

          const res = await new Promise<ServerAck<any>>((resolve) => {
            socket.emit(
              "consume",
              { transportId: recvTransport.id, producerId, rtpCapabilities: device.rtpCapabilities },
              resolve
            );
          });
          if (!res.ok) return;

          const consumer = await recvTransport.consume({
            id: res.data.id,
            producerId: res.data.producerId,
            kind: res.data.kind,
            rtpParameters: res.data.rtpParameters,
          });

          const stream = new MediaStream([consumer.track]);
          setRemoteTracks((prev) => [
            ...prev,
            { id: consumer.id, producerId: res.data.producerId, userId, kind: consumer.kind, stream },
          ]);

          socket.emit("resumeConsumer", { consumerId: consumer.id }, () => {});
        };

        socket.on("newProducer", ({ producerId, userId }: any) => {
          if (!producerId || !userId) return;
          consumeProducer(producerId, userId).catch(() => {});
        });

        socket.on("producerClosed", ({ producerId }: any) => {
          setRemoteTracks((prev) => prev.filter((t) => t.producerId !== producerId));
          setProducerMuted((prev) => {
            const next = { ...prev };
            delete next[String(producerId)];
            return next;
          });
        });

        socket.on("existingProducers", ({ producers }: any) => {
          if (!Array.isArray(producers)) return;
          for (const p of producers) {
            if (p?.producerId && p?.userId) {
              if (p.kind === "audio" && typeof p.paused === "boolean") {
                setProducerMuted((prev) => ({ ...prev, [String(p.producerId)]: Boolean(p.paused) }));
              }
              consumeProducer(p.producerId, p.userId).catch(() => {});
            }
          }
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

        socket.on("producerMuted", ({ producerId, muted }: any) => {
          if (!producerId) return;
          setProducerMuted((prev) => ({ ...prev, [String(producerId)]: Boolean(muted) }));
        });

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

  const retry = () => {
    startTransition(() => {
      window.location.reload();
    });
  };

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant={micOn ? "outline" : "secondary"}
          aria-label={micOn ? "Выключить микрофон" : "Включить микрофон"}
          onClick={() => {
            const track = localStreamRef.current?.getAudioTracks?.()?.[0];
            const producer = audioProducerRef.current;
            const next = !micOn;
            if (track) track.enabled = next;
            try {
              if (producer) next ? producer.resume?.() : producer.pause?.();
            } catch {}
            setMicOn(next);
          }}
        >
          {micOn ? <Mic /> : <MicOff />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant={camOn ? "outline" : "secondary"}
          aria-label={camOn ? "Выключить камеру" : "Включить камеру"}
          onClick={() => {
            const track = localStreamRef.current?.getVideoTracks?.()?.[0];
            const producer = videoProducerRef.current;
            const next = !camOn;
            if (track) track.enabled = next;
            try {
              if (producer) next ? producer.resume?.() : producer.pause?.();
            } catch {}
            setCamOn(next);
          }}
        >
          {camOn ? <Video /> : <VideoOff />}
        </Button>
      </div>

      <div className="space-y-2">
        <div className={tokens.typography.h3}>Эфир</div>
        <div className="flex flex-wrap items-center gap-2">
          {isHost ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => socketRef.current?.emit("setAllAudioMuted", { muted: true }, () => {})}
            >
              <VolumeX className="mr-1" /> Выключить всем
            </Button>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-black">
          <div className="relative aspect-video w-full">
            {isHost ? (
              <video ref={localVideoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
            ) : hostVideo ? (
              <RemoteVideo stream={hostVideo.stream} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl font-semibold text-white/80">
                {initials(hostPeer?.name ?? null)}
              </div>
            )}

            <div className="absolute left-3 top-3 flex max-w-full gap-2 overflow-x-auto rounded-xl bg-black/35 p-2 backdrop-blur">
              {/* self view */}
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black">
                <video ref={selfThumbVideoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
                <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                  <div className="truncate rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
                    {isHost ? "Вы" : "Вы"}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="rounded bg-black/55 p-1 text-white">{micOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}</div>
                    <div className="rounded bg-black/55 p-1 text-white">{camOn ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}</div>
                  </div>
                </div>
              </div>

              {peers
                .filter((p) => (isHost ? p.userId !== selfUserId : p.userId !== hostUserId))
                .map((p) => {
                  const video = remoteTracks.find((t) => t.userId === p.userId && t.kind === "video") ?? null;
                  const audio = remoteTracks.find((t) => t.userId === p.userId && t.kind === "audio") ?? null;
                  const muted = audio ? Boolean(producerMuted[audio.producerId]) : true;
                  return (
                    <div key={p.userId} className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black">
                      {video ? (
                        <RemoteVideo stream={video.stream} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-white/80">
                          {initials(p.name)}
                        </div>
                      )}
                      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                        <div className="truncate rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
                          {p.name ?? p.userId}
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="rounded bg-black/55 p-1 text-white">{muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}</div>
                          {isHost && p.userId !== selfUserId ? (
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
                              {muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play?.().catch(() => {});
  }, [stream]);
  return <video ref={ref} className="w-full rounded-xl border bg-black" autoPlay playsInline />;
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play?.().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay controls className="w-full" />;
}

