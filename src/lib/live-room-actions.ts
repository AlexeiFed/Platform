"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  isMarathonLiveJoinAllowedToday,
  marathonLiveJoinDeniedMessage,
} from "@/lib/marathon-live-broadcast";
import type { LiveRoomStatus } from "@prisma/client";

const loadLiveEventForGate = async (eventId: string) => {
  return prisma.marathonEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      type: true,
      dayOffset: true,
      scheduledAt: true,
      product: { select: { slug: true, startDate: true } },
    },
  });
};

export async function startLiveRoom(eventId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    const event = await loadLiveEventForGate(eventId);
    if (!event || event.type !== "LIVE") {
      return { error: "Событие эфира не найдено" } as const;
    }

    const gate = isMarathonLiveJoinAllowedToday({
      dayOffset: event.dayOffset,
      scheduledAt: event.scheduledAt,
      productStartDate: event.product.startDate,
    });
    if (!gate.ok) {
      return { error: marathonLiveJoinDeniedMessage(gate) } as const;
    }

    const room = await prisma.liveRoom.upsert({
      where: { marathonEventId: eventId },
      update: { status: "LIVE" satisfies LiveRoomStatus, startedAt: new Date(), endedAt: null },
      create: { marathonEventId: eventId, status: "LIVE" satisfies LiveRoomStatus, startedAt: new Date() },
      select: { id: true, marathonEvent: { select: { product: { select: { slug: true } } } } },
    });
    const slug = room.marathonEvent.product.slug;
    revalidatePath(`/learn/${slug}/event/${eventId}`);
    revalidatePath(`/learn/${slug}/event/${eventId}/live`);
    revalidatePath("/admin/live");
    revalidatePath(`/admin/live/${eventId}`);
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
      select: { marathonEvent: { select: { product: { select: { slug: true } } } } },
    });
    const slug = room.marathonEvent.product.slug;
    revalidatePath(`/learn/${slug}/event/${eventId}`);
    revalidatePath(`/learn/${slug}/event/${eventId}/live`);
    revalidatePath("/admin/live");
    revalidatePath(`/admin/live/${eventId}`);
    return { success: true } as const;
  } catch (e) {
    console.error("[endLiveRoom]", e);
    return { error: "Произошла ошибка" } as const;
  }
}
