"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getPresignedUploadUrl, getPublicUrl, objectExists } from "@/lib/s3";
import { canHostLiveForProduct, isLiveStaffRole } from "@/lib/live-room-staff-access";
import {
  isMarathonLiveJoinAllowedToday,
  marathonLiveJoinDeniedMessage,
} from "@/lib/marathon-live-broadcast";

const formatSchema = z.enum(["webm", "mp4"]);

const loadLiveEventForGate = async (eventId: string) => {
  return prisma.marathonEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      type: true,
      productId: true,
      dayOffset: true,
      scheduledAt: true,
      product: { select: { slug: true, startDate: true } },
    },
  });
};

function recordingObjectKey(roomId: string, recordingId: string, format: z.infer<typeof formatSchema>) {
  return `live-recordings/${roomId}/${recordingId}.${format}`;
}

function contentTypeForFormat(format: z.infer<typeof formatSchema>) {
  return format === "mp4" ? "video/mp4" : "video/webm";
}

export async function startLiveRoomRecording(eventId: string, format: "webm" | "mp4") {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  const parsedFormat = formatSchema.safeParse(format);
  if (!parsedFormat.success) {
    return { error: "Неверный формат" } as const;
  }

  try {
    const event = await loadLiveEventForGate(eventId);
    if (!event || event.type !== "LIVE") {
      return { error: "Событие эфира не найдено" } as const;
    }
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

    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: { id: true },
    });
    if (!room) {
      return { error: "Комната эфира не найдена. Сначала запустите эфир." } as const;
    }

    const rec = await prisma.liveRoomRecording.create({
      data: {
        roomId: room.id,
        status: "RECORDING",
        profile: "HIGH",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    const key = recordingObjectKey(room.id, rec.id, parsedFormat.data);
    const contentType = contentTypeForFormat(parsedFormat.data);

    let uploadUrl: string;
    try {
      uploadUrl = await getPresignedUploadUrl(key, contentType, 3600);
    } catch (e) {
      console.error("[startLiveRoomRecording] presign", e);
      await prisma.liveRoomRecording.update({
        where: { id: rec.id },
        data: { status: "FAILED", endedAt: new Date(), error: "Не удалось получить URL загрузки" },
      });
      return { error: "Не удалось подготовить загрузку в S3" } as const;
    }

    revalidatePath(`/admin/live/${eventId}`);
    revalidatePath("/admin/live");

    return {
      success: true,
      data: {
        recordingId: rec.id,
        uploadUrl,
        key,
        format: parsedFormat.data,
        contentType,
      },
    } as const;
  } catch (e) {
    console.error("[startLiveRoomRecording]", e);
    return { error: "Не удалось начать запись" } as const;
  }
}

export async function finishLiveRoomRecording(
  eventId: string,
  recordingId: string,
  input: { format: "webm" | "mp4"; sizeBytes: number; durationSec: number }
) {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  const parsedFormat = formatSchema.safeParse(input.format);
  if (!parsedFormat.success || !Number.isFinite(input.sizeBytes) || input.sizeBytes < 1) {
    return { error: "Неверные данные записи" } as const;
  }

  try {
    const event = await loadLiveEventForGate(eventId);
    if (!event || event.type !== "LIVE") {
      return { error: "Событие эфира не найдено" } as const;
    }
    if (!(await canHostLiveForProduct(session.user, event.productId))) {
      return { error: "Нет доступа" } as const;
    }

    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: { id: true },
    });
    if (!room) {
      return { error: "Комната не найдена" } as const;
    }

    const rec = await prisma.liveRoomRecording.findFirst({
      where: { id: recordingId, roomId: room.id },
      select: { id: true, status: true },
    });
    if (!rec) {
      return { error: "Запись не найдена" } as const;
    }
    if (rec.status !== "RECORDING") {
      return { error: "Запись уже завершена" } as const;
    }

    const key = recordingObjectKey(room.id, recordingId, parsedFormat.data);
    if (!(await objectExists(key))) {
      await prisma.liveRoomRecording.update({
        where: { id: recordingId },
        data: {
          status: "FAILED",
          endedAt: new Date(),
          error: "Файл не найден в S3 после загрузки",
        },
      });
      return { error: "Файл записи не найден в хранилище. Повторите запись." } as const;
    }

    const manifestUrl = getPublicUrl(key);
    const durationSec = Math.max(0, Math.min(24 * 3600, Math.floor(input.durationSec)));

    await prisma.liveRoomRecording.update({
      where: { id: recordingId },
      data: {
        status: "READY",
        endedAt: new Date(),
        manifestUrl,
        durationSec,
        sizeBytes: BigInt(Math.floor(input.sizeBytes)),
      },
    });

    revalidatePath(`/admin/live/${eventId}`);
    revalidatePath("/admin/live");

    return { success: true, data: { manifestUrl } } as const;
  } catch (e) {
    console.error("[finishLiveRoomRecording]", e);
    return { error: "Не удалось сохранить метаданные записи" } as const;
  }
}

export async function failLiveRoomRecording(eventId: string, recordingId: string, message: string) {
  const session = await auth();
  if (!session || !isLiveStaffRole(session.user.role)) {
    return { error: "Нет доступа" } as const;
  }

  const msg = String(message).slice(0, 2000);

  try {
    const room = await prisma.liveRoom.findUnique({
      where: { marathonEventId: eventId },
      select: { id: true },
    });
    if (!room) return { error: "Комната не найдена" } as const;

    await prisma.liveRoomRecording.updateMany({
      where: { id: recordingId, roomId: room.id, status: "RECORDING" },
      data: { status: "FAILED", endedAt: new Date(), error: msg || "Ошибка записи" },
    });

    revalidatePath(`/admin/live/${eventId}`);
    revalidatePath("/admin/live");

    return { success: true } as const;
  } catch (e) {
    console.error("[failLiveRoomRecording]", e);
    return { error: "Не удалось обновить статус" } as const;
  }
}
