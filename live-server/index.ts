import http from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { z } from "zod";
import * as mediasoup from "mediasoup";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const env = z
  .object({
    LIVE_SERVER_PORT: z.coerce.number().default(4010),
    LIVE_SERVER_JWT_SECRET: z.string().min(20),
    LIVE_RTC_MIN_PORT: z.coerce.number().default(40000),
    LIVE_RTC_MAX_PORT: z.coerce.number().default(49999),
    LIVE_ANNOUNCED_IP: z.string().optional(),
  })
  .parse(process.env);

const tokenSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["HOST", "SPEAKER", "VIEWER"]),
  name: z.string().min(1).optional(),
});

type RoomState = {
  worker: mediasoup.types.Worker;
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  peers: Map<
    string,
    {
      socketId: string;
      userId: string;
      role: "HOST" | "SPEAKER" | "VIEWER";
      name: string | null;
      transportIds: Set<string>;
      producerIds: Set<string>;
      consumerIds: Set<string>;
    }
  >;
};

const rooms = new Map<string, RoomState>();

async function getOrCreateRoom(roomId: string): Promise<RoomState> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const worker = await mediasoup.createWorker({
    rtcMinPort: env.LIVE_RTC_MIN_PORT,
    rtcMaxPort: env.LIVE_RTC_MAX_PORT,
  });
  worker.on("died", () => {
    // eslint-disable-next-line no-console
    console.error("[live-server] mediasoup worker died, room:", roomId);
    rooms.delete(roomId);
  });

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { "x-google-start-bitrate": 1000 },
      },
    ],
  });

  const state: RoomState = {
    worker,
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    peers: new Map(),
  };
  rooms.set(roomId, state);
  return state;
}

function verifyToken(raw: string) {
  const payload = jwt.verify(raw, env.LIVE_SERVER_JWT_SECRET);
  return tokenSchema.parse(payload);
}

const server = http.createServer();
const io = new Server(server, {
  path: "/live/socket.io",
  cors: {
    origin: true,
    credentials: true,
  },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (!token || typeof token !== "string") return next(new Error("No token"));
    const parsed = verifyToken(token);
    (socket.data as any).live = parsed;
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const live = (socket.data as any).live as z.infer<typeof tokenSchema>;
  const roomId = live.roomId;
  const room = await getOrCreateRoom(roomId);

  socket.join(roomId);

  const peerKey = socket.id;
  room.peers.set(peerKey, {
    socketId: socket.id,
    userId: live.userId,
    role: live.role,
    name: live.name ?? null,
    transportIds: new Set(),
    producerIds: new Set(),
    consumerIds: new Set(),
  });

  // best-effort: mark joined
  prisma.liveRoomParticipant
    .upsert({
      where: { roomId_userId: { roomId, userId: live.userId } },
      update: { joinedAt: new Date(), leftAt: null, role: live.role },
      create: { roomId, userId: live.userId, role: live.role },
    })
    .catch(() => {});

  socket.emit("routerRtpCapabilities", room.router.rtpCapabilities);

  // Важно: если зритель подключился позже, ему нужно получить уже существующие продьюсеры,
  // иначе он не увидит/не услышит эфир до появления новых потоков.
  socket.emit("existingProducers", {
    producers: [...room.producers.values()].map((p) => ({
      producerId: p.id,
      kind: p.kind,
      userId: (p.appData as any)?.userId ?? null,
      paused: Boolean((p as any).paused),
    })),
  });

  socket.emit("peers", {
    peers: [...room.peers.values()].map((p) => ({
      userId: p.userId,
      role: p.role,
      name: p.name,
    })),
  });

  socket.to(roomId).emit("peerJoined", { userId: live.userId, role: live.role, name: live.name ?? null });

  socket.on("createWebRtcTransport", async (_, cb) => {
    try {
      const transport = await room.router.createWebRtcTransport({
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: env.LIVE_ANNOUNCED_IP,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1_000_000,
      });

      room.transports.set(transport.id, transport);
      room.peers.get(peerKey)?.transportIds.add(transport.id);

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
          room.transports.delete(transport.id);
        }
      });

      cb({
        ok: true,
        data: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });
    } catch (e: any) {
      cb({ ok: false, error: e?.message ?? "transport error" });
    }
  });

  socket.on("connectTransport", async ({ transportId, dtlsParameters }, cb) => {
    try {
      const transport = room.transports.get(transportId);
      if (!transport) return cb({ ok: false, error: "transport not found" });
      await transport.connect({ dtlsParameters });
      cb({ ok: true });
    } catch (e: any) {
      cb({ ok: false, error: e?.message ?? "connect error" });
    }
  });

  socket.on("produce", async ({ transportId, kind, rtpParameters, appData }, cb) => {
    try {
      const peer = room.peers.get(peerKey);
      if (!peer) return cb({ ok: false, error: "peer not found" });

      const transport = room.transports.get(transportId);
      if (!transport) return cb({ ok: false, error: "transport not found" });

      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData: { ...(appData ?? {}), userId: peer.userId, kind },
      });
      room.producers.set(producer.id, producer);
      peer.producerIds.add(producer.id);

      producer.on("transportclose", () => {
        room.producers.delete(producer.id);
        peer.producerIds.delete(producer.id);
      });

      socket.to(roomId).emit("newProducer", {
        producerId: producer.id,
        userId: peer.userId,
        kind: producer.kind,
      });

      cb({ ok: true, data: { id: producer.id } });
    } catch (e: any) {
      cb({ ok: false, error: e?.message ?? "produce error" });
    }
  });

  socket.on("setUserAudioMuted", async ({ userId, muted }, cb) => {
    try {
      const peer = room.peers.get(peerKey);
      if (!peer || peer.role !== "HOST") return cb?.({ ok: false, error: "forbidden" });
      const target = String(userId);
      const isMuted = Boolean(muted);

      for (const p of room.producers.values()) {
        const app = (p.appData ?? {}) as any;
        if (app.userId !== target) continue;
        if (p.kind !== "audio") continue;
        try {
          if (isMuted) await (p as any).pause?.();
          else await (p as any).resume?.();
        } catch {}
        socket.to(roomId).emit("producerMuted", { producerId: p.id, muted: isMuted });
      }

      cb?.({ ok: true });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message ?? "mute error" });
    }
  });

  socket.on("setAllAudioMuted", async ({ muted }, cb) => {
    try {
      const peer = room.peers.get(peerKey);
      if (!peer || peer.role !== "HOST") return cb?.({ ok: false, error: "forbidden" });
      const isMuted = Boolean(muted);

      for (const p of room.producers.values()) {
        if (p.kind !== "audio") continue;
        try {
          if (isMuted) await (p as any).pause?.();
          else await (p as any).resume?.();
        } catch {}
        socket.to(roomId).emit("producerMuted", { producerId: p.id, muted: isMuted });
      }

      cb?.({ ok: true });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message ?? "mute error" });
    }
  });

  socket.on("consume", async ({ transportId, producerId, rtpCapabilities }, cb) => {
    try {
      const transport = room.transports.get(transportId);
      if (!transport) return cb({ ok: false, error: "transport not found" });

      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        return cb({ ok: false, error: "cannot consume" });
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      room.consumers.set(consumer.id, consumer);
      room.peers.get(peerKey)?.consumerIds.add(consumer.id);

      consumer.on("transportclose", () => {
        room.consumers.delete(consumer.id);
        room.peers.get(peerKey)?.consumerIds.delete(consumer.id);
      });
      consumer.on("producerclose", () => {
        room.consumers.delete(consumer.id);
        room.peers.get(peerKey)?.consumerIds.delete(consumer.id);
        socket.emit("producerClosed", { producerId });
      });

      cb({
        ok: true,
        data: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });
    } catch (e: any) {
      cb({ ok: false, error: e?.message ?? "consume error" });
    }
  });

  socket.on("resumeConsumer", async ({ consumerId }, cb) => {
    try {
      const consumer = room.consumers.get(consumerId);
      if (!consumer) return cb({ ok: false, error: "consumer not found" });
      await consumer.resume();
      cb({ ok: true });
    } catch (e: any) {
      cb({ ok: false, error: e?.message ?? "resume error" });
    }
  });

  socket.on("disconnect", () => {
    const peer = room.peers.get(peerKey);
    if (peer) {
      for (const id of peer.transportIds) room.transports.get(id)?.close();
      for (const id of peer.producerIds) room.producers.get(id)?.close();
      for (const id of peer.consumerIds) room.consumers.get(id)?.close();
    }

    room.peers.delete(peerKey);
    socket.to(roomId).emit("peerLeft", { userId: live.userId });

    prisma.liveRoomParticipant
      .update({
        where: { roomId_userId: { roomId, userId: live.userId } },
        data: { leftAt: new Date() },
      })
      .catch(() => {});
  });
});

server.listen(env.LIVE_SERVER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[live-server] listening on :${env.LIVE_SERVER_PORT}`);
});

