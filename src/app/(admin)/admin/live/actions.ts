"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import {
  getLiveBroadcastDateKey,
  isMarathonLiveJoinAllowedToday,
  marathonLiveJoinDeniedMessage,
} from "@/lib/marathon-live-broadcast";
import { canHostLiveForProduct, isLiveStaffRole } from "@/lib/live-room-staff-access";

const getJwtSecret = () => {
  const secret = process.env.LIVE_SERVER_JWT_SECRET;
  if (!secret || secret.length < 20) throw new Error("LIVE_SERVER_JWT_SECRET is not set");
  return secret;
};

export async function getAdminLiveJoinToken(eventId: string) {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const event = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        type: true,
        productId: true,
        dayOffset: true,
        scheduledAt: true,
        product: { select: { slug: true, type: true, startDate: true } },
      },
    });
    if (!event || event.product.type !== "MARATHON") return { error: "Событие не найдено" } as const;
    if (event.type !== "LIVE") return { error: "Это не событие эфира" } as const;
    if (!(await canHostLiveForProduct(session.user, event.productId))) {
      return { error: "Нет доступа к этому эфиру" } as const;
    }

    const gate = isMarathonLiveJoinAllowedToday({
      dayOffset: event.dayOffset,
      scheduledAt: event.scheduledAt,
      productStartDate: event.product.startDate,
    });
    if (!gate.ok) {
      return { error: marathonLiveJoinDeniedMessage(gate) } as const;
    }

    const broadcastDay = getLiveBroadcastDateKey({
      dayOffset: event.dayOffset,
      scheduledAt: event.scheduledAt,
      productStartDate: event.product.startDate,
    });
    if (!broadcastDay) {
      return { error: marathonLiveJoinDeniedMessage({ ok: false, reason: "no_schedule" }) } as const;
    }

    const existingRoom = await prisma.liveRoom.upsert({
      where: { marathonEventId: event.id },
      update: {},
      create: { marathonEventId: event.id },
      select: { id: true, status: true, maxSpeakers: true },
    });

    if (existingRoom.status === "ENDED") {
      return { error: "Это событие эфира завершено" } as const;
    }

    const room =
      existingRoom.status === "LIVE"
        ? existingRoom
        : await prisma.liveRoom.update({
            where: { id: existingRoom.id },
            data: { status: "LIVE", startedAt: new Date(), endedAt: null },
            select: { id: true, status: true, maxSpeakers: true },
          });
    if (existingRoom.status !== "LIVE") {
      revalidatePath("/admin/live");
      revalidatePath(`/admin/live/${event.id}`);
      revalidatePath(`/learn/${event.product.slug}/event/${event.id}`);
      revalidatePath(`/learn/${event.product.slug}/event/${event.id}/live`);
    }

    await prisma.liveRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      update: { role: "HOST", leftAt: null },
      create: { roomId: room.id, userId: session.user.id, role: "HOST" },
      select: { id: true },
    });

    const token = jwt.sign(
      {
        roomId: room.id,
        marathonEventId: event.id,
        broadcastDay,
        userId: session.user.id,
        role: "HOST",
        name: session.user.name ?? "Ведущий",
      },
      getJwtSecret(),
      { expiresIn: "8h" }
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
