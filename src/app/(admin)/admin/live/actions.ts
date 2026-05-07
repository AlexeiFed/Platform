"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

const getJwtSecret = () => {
  const secret = process.env.LIVE_SERVER_JWT_SECRET;
  if (!secret || secret.length < 20) throw new Error("LIVE_SERVER_JWT_SECRET is not set");
  return secret;
};

export async function getAdminLiveJoinToken(eventId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const event = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, type: true, productId: true, product: { select: { slug: true, type: true } } },
    });
    if (!event || event.product.type !== "MARATHON") return { error: "Событие не найдено" } as const;
    if (event.type !== "LIVE") return { error: "Это не событие эфира" } as const;

    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: event.id },
      update: { status: "LIVE", startedAt: new Date(), endedAt: null },
      create: { marathonEventId: event.id, status: "LIVE", startedAt: new Date() },
      select: { id: true, status: true, maxSpeakers: true, startedAt: true },
    });

    await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      update: { role: "HOST", leftAt: null },
      create: { roomId: room.id, userId: session.user.id, role: "HOST" },
      select: { id: true },
    });

    const token = jwt.sign(
      { roomId: room.id, userId: session.user.id, role: "HOST", name: session.user.name ?? "Ведущий" },
      getJwtSecret(),
      { expiresIn: "6h" }
    );

    return {
      success: true,
      data: {
        eventTitle: event.title,
        productSlug: event.product.slug,
        room: { id: room.id, status: room.status, maxSpeakers: room.maxSpeakers },
        token,
      },
    } as const;
  } catch (e) {
    console.error("[getAdminLiveJoinToken]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

