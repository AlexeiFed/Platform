"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canHostLiveForProduct, isLiveStaffRole } from "@/lib/live-room-staff-access";

export async function listSpeakerRequests(eventId: string) {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: {
        id: true,
        status: true,
        maxSpeakers: true,
        marathonEvent: { select: { productId: true } },
        participants: { where: { role: "SPEAKER" }, select: { id: true } },
      },
    });
    if (!room) {
      return { success: true, data: { roomId: null, maxSpeakers: 6, speakerCount: 0, requests: [] } } as const;
    }
    if (!(await canHostLiveForProduct(session.user, room.marathonEvent.productId))) {
      return { error: "Нет доступа к этому эфиру" } as const;
    }

    const requests = await prisma.liveRoomParticipant.findMany({
      where: { roomId: room.id, speakerRequestedAt: { not: null }, speakerApprovedAt: null, role: "VIEWER" },
      orderBy: { speakerRequestedAt: "asc" },
      select: {
        userId: true,
        speakerRequestedAt: true,
        user: { select: { name: true, email: true } },
      },
      take: 50,
    });

    return {
      success: true,
      data: {
        roomId: room.id,
        roomStatus: room.status,
        maxSpeakers: room.maxSpeakers,
        speakerCount: room.participants.length,
        requests: requests.map((r) => ({
          userId: r.userId,
          requestedAt: r.speakerRequestedAt!.toISOString(),
          name: r.user.name ?? null,
          email: r.user.email,
        })),
      },
    } as const;
  } catch (e) {
    console.error("[listSpeakerRequests]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function approveSpeaker(eventId: string, userId: string) {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: {
        id: true,
        status: true,
        maxSpeakers: true,
        marathonEvent: { select: { productId: true } },
        participants: { where: { role: "SPEAKER" }, select: { id: true } },
      },
    });
    if (!room) return { error: "Комната не найдена" } as const;
    if (room.status !== "LIVE") return { error: "Доступно только во время эфира" } as const;
    if (!(await canHostLiveForProduct(session.user, room.marathonEvent.productId))) {
      return { error: "Нет доступа к этому эфиру" } as const;
    }

    const existing = await prisma.liveRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: { role: true },
    });
    if (existing?.role === "HOST") return { error: "Нельзя изменить роль ведущего" } as const;
    if (existing?.role === "SPEAKER") return { success: true } as const;

    if (room.participants.length >= room.maxSpeakers) {
      return { error: `Лимит спикеров: ${room.maxSpeakers}` } as const;
    }

    await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: { role: "SPEAKER", speakerApprovedAt: new Date(), speakerRequestedAt: null },
      create: { roomId: room.id, userId, role: "SPEAKER", speakerApprovedAt: new Date() },
      select: { id: true },
    });

    return { success: true } as const;
  } catch (e) {
    console.error("[approveSpeaker]", e);
    return { error: "Произошла ошибка" } as const;
  }
}
