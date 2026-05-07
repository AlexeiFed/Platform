"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import { enrollmentHasCriterion, loadEnrollmentForCriteriaByUserProduct } from "@/lib/enrollment-criteria";
import { criterionForMarathonEventType } from "@/lib/product-criteria";
import type { LiveRoomParticipantRole, LiveRoomStatus } from "@prisma/client";

const getJwtSecret = () => {
  const secret = process.env.LIVE_SERVER_JWT_SECRET;
  if (!secret || secret.length < 20) throw new Error("LIVE_SERVER_JWT_SECRET is not set");
  return secret;
};

export async function getOrCreateLiveRoom(eventId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" } as const;

  try {
    const event = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, type: true, productId: true, product: { select: { slug: true, type: true } } },
    });
    if (!event || event.product.type !== "MARATHON") return { error: "Событие не найдено" } as const;

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_productId: { userId: session.user.id, productId: event.productId } },
      select: { id: true },
    });
    if (!enrollment) return { error: "Нет доступа к марафону" } as const;

    const critRow = await loadEnrollmentForCriteriaByUserProduct(session.user.id, event.productId);
    const required = criterionForMarathonEventType(event.type);
    if (required && critRow && !enrollmentHasCriterion(critRow, required)) {
      return { error: "Эфиры недоступны в вашем тарифе" } as const;
    }

    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: eventId },
      update: {},
      create: { marathonEventId: eventId },
      select: { id: true, status: true, maxSpeakers: true, marathonEvent: { select: { product: { select: { slug: true } } } } },
    });

    return { success: true, data: { id: room.id, status: room.status, maxSpeakers: room.maxSpeakers, productSlug: room.marathonEvent.product.slug } } as const;
  } catch (e) {
    console.error("[getOrCreateLiveRoom]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function startLiveRoom(eventId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: eventId },
      update: { status: "LIVE" satisfies LiveRoomStatus, startedAt: new Date(), endedAt: null },
      create: { marathonEventId: eventId, status: "LIVE" satisfies LiveRoomStatus, startedAt: new Date() },
      select: { id: true, marathonEvent: { select: { product: { select: { slug: true } } } } },
    });
    revalidatePath(`/learn/${room.marathonEvent.product.slug}/event/${eventId}`);
    revalidatePath(`/learn/${room.marathonEvent.product.slug}/event/${eventId}/live`);
    return { success: true, data: { roomId: room.id } } as const;
  } catch (e) {
    console.error("[startLiveRoom]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function endLiveRoom(eventId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.update({
      where: { marathonEventId: eventId },
      data: { status: "ENDED" satisfies LiveRoomStatus, endedAt: new Date() },
      select: { id: true, marathonEvent: { select: { product: { select: { slug: true } } } } },
    });
    revalidatePath(`/learn/${room.marathonEvent.product.slug}/event/${eventId}`);
    revalidatePath(`/learn/${room.marathonEvent.product.slug}/event/${eventId}/live`);
    return { success: true } as const;
  } catch (e) {
    console.error("[endLiveRoom]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function getLiveJoinToken(eventId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" } as const;

  try {
    const event = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, type: true, productId: true, product: { select: { slug: true, type: true } } },
    });
    if (!event || event.product.type !== "MARATHON") return { error: "Событие не найдено" } as const;

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_productId: { userId: session.user.id, productId: event.productId } },
      select: { id: true },
    });
    if (!enrollment) return { error: "Нет доступа к марафону" } as const;

    const critRow = await loadEnrollmentForCriteriaByUserProduct(session.user.id, event.productId);
    const required = criterionForMarathonEventType(event.type);
    if (required && critRow && !enrollmentHasCriterion(critRow, required)) {
      return { error: "Эфиры недоступны в вашем тарифе" } as const;
    }

    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: eventId },
      update: {},
      create: { marathonEventId: eventId },
      select: { id: true, status: true, maxSpeakers: true },
    });

    const existingParticipant = await prisma.liveRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      select: { role: true, speakerApprovedAt: true },
    });

    // Роль:
    // - HOST: admin/curator
    // - SPEAKER: если апрувнули (или уже был спикером)
    // - VIEWER: иначе
    const role: LiveRoomParticipantRole =
      session.user.role === "ADMIN" || session.user.role === "CURATOR"
        ? "HOST"
        : existingParticipant?.role === "SPEAKER" || existingParticipant?.speakerApprovedAt
          ? "SPEAKER"
          : "VIEWER";

    const participant = await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      update: { role, leftAt: null },
      create: { roomId: room.id, userId: session.user.id, role },
      select: { id: true, role: true, speakerRequestedAt: true, speakerApprovedAt: true },
    });

    const token = jwt.sign(
      { roomId: room.id, userId: session.user.id, role, name: session.user.name ?? "Участник" },
      getJwtSecret(),
      { expiresIn: "6h" }
    );

    return {
      success: true,
      data: {
        room: { id: room.id, status: room.status, maxSpeakers: room.maxSpeakers },
        token,
        role,
        participant: {
          role: participant.role,
          speakerRequestedAt: participant.speakerRequestedAt?.toISOString() ?? null,
          speakerApprovedAt: participant.speakerApprovedAt?.toISOString() ?? null,
        },
        productSlug: event.product.slug,
      },
    } as const;
  } catch (e) {
    console.error("[getLiveJoinToken]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function requestSpeaker(eventId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" } as const;

  try {
    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: eventId },
      update: {},
      create: { marathonEventId: eventId },
      select: { id: true },
    });

    await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      update: { speakerRequestedAt: new Date() },
      create: { roomId: room.id, userId: session.user.id, role: "VIEWER", speakerRequestedAt: new Date() },
      select: { id: true },
    });

    return { success: true } as const;
  } catch (e) {
    console.error("[requestSpeaker]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function listSpeakerRequests(eventId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: { id: true, maxSpeakers: true, participants: { where: { role: "SPEAKER" }, select: { id: true } } },
    });
    if (!room) return { success: true, data: { roomId: null, maxSpeakers: 6, speakerCount: 0, requests: [] } } as const;

    const requests = await prisma.liveRoomParticipant.findMany({
      where: { roomId: room.id, speakerRequestedAt: { not: null }, speakerApprovedAt: null },
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
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: {
        id: true,
        maxSpeakers: true,
        participants: { where: { role: "SPEAKER" }, select: { id: true } },
      },
    });
    if (!room) return { error: "Комната не найдена" } as const;
    if (room.participants.length >= room.maxSpeakers) {
      return { error: `Лимит спикеров: ${room.maxSpeakers}` } as const;
    }

    await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: { role: "SPEAKER", speakerApprovedAt: new Date() },
      create: { roomId: room.id, userId, role: "SPEAKER", speakerApprovedAt: new Date() },
      select: { id: true },
    });

    return { success: true } as const;
  } catch (e) {
    console.error("[approveSpeaker]", e);
    return { error: "Произошла ошибка" } as const;
  }
}

