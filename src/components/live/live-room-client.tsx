"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import type { Device as MediasoupDevice } from "mediasoup-client";
import { Device } from "mediasoup-client";

type ServerAck<T> = { ok: true; data: T } | { ok: false; error: string };

type Props = {
  liveServerUrl: string;
  token: string;
  canProduce: boolean;
};

type RemoteTrack = {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  stream: MediaStream;
};

export function LiveRoomClient({ liveServerUrl, token, canProduce }: Props) {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState("");
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [isPending, startTransition] = useTransition();

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<MediasoupDevice | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const label = useMemo(() => (canProduce ? "Спикер/ведущий" : "Зритель"), [canProduce]);

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
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];
            if (audioTrack) await sendTransport.produce({ track: audioTrack });
            if (videoTrack) await sendTransport.produce({ track: videoTrack });
          } catch (e: any) {
            setError(e?.message ?? "Не удалось получить доступ к камере/микрофону");
          }
        }

        const consumeProducer = async (producerId: string) => {
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
            { id: consumer.id, producerId: res.data.producerId, kind: consumer.kind, stream },
          ]);

          socket.emit("resumeConsumer", { consumerId: consumer.id }, () => {});
        };

        socket.on("newProducer", ({ producerId }: any) => {
          consumeProducer(producerId).catch(() => {});
        });

        socket.on("producerClosed", ({ producerId }: any) => {
          setRemoteTracks((prev) => prev.filter((t) => t.producerId !== producerId));
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
    };
  }, [liveServerUrl, token, canProduce]);

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

      {canProduce ? (
        <div className="space-y-2">
          <div className={`${tokens.typography.small} text-muted-foreground`}>Ваше видео (видно вам)</div>
          <video ref={localVideoRef} className="w-full max-w-xl rounded-xl border bg-black" autoPlay playsInline muted />
        </div>
      ) : null}

      <div className="space-y-2">
        <div className={tokens.typography.h3}>Эфир</div>
        {remoteTracks.length === 0 ? (
          <div className={`${tokens.typography.small} text-muted-foreground`}>Пока нет активных потоков.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {remoteTracks
              .filter((t) => t.kind === "video")
              .map((t) => (
                <RemoteVideo key={t.id} stream={t.stream} />
              ))}
            {remoteTracks
              .filter((t) => t.kind === "audio")
              .map((t) => (
                <RemoteAudio key={t.id} stream={t.stream} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className="w-full rounded-xl border bg-black" autoPlay playsInline />;
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay controls className="w-full" />;
}

