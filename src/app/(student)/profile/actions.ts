/**
 * actions.ts — /profile
 * Серверные действия для профиля студента:
 * основные данные (имя/аватар/вес/рост), фото прогресса (до/после), замеры.
 */
"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireUser() {
  const session = await auth();
  if (!session) return null;
  return session;
}

// === Базовые данные профиля ===

const basicSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  weight: z.number().positive().max(500).nullable().optional(),
  height: z.number().positive().max(300).nullable().optional(),
});

export async function updateProfileBasic(input: z.infer<typeof basicSchema>) {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };
  try {
    const data = basicSchema.parse(input);
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.height !== undefined ? { height: data.height } : {}),
      },
    });
    revalidatePath("/profile");
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[updateProfileBasic]", e);
    return { error: "Ошибка сохранения" };
  }
}

// === Фото прогресса ===

const photoSchema = z.object({
  type: z.enum(["BEFORE", "AFTER"]),
  position: z.number().int().min(0).max(3),
  url: z.string().url(),
});

/** Устанавливает фото на позицию, заменяя прежнее фото этой позиции. */
export async function setProgressPhoto(input: z.infer<typeof photoSchema>) {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };
  try {
    const data = photoSchema.parse(input);
    await prisma.$transaction([
      prisma.userProgressPhoto.deleteMany({
        where: { userId: session.user.id, type: data.type, position: data.position },
      }),
      prisma.userProgressPhoto.create({
        data: {
          userId: session.user.id,
          type: data.type,
          position: data.position,
          url: data.url,
        },
      }),
    ]);
    revalidatePath("/profile");
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[setProgressPhoto]", e);
    return { error: "Ошибка сохранения" };
  }
}

export async function removeProgressPhoto(id: string) {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };
  try {
    await prisma.userProgressPhoto.deleteMany({
      where: { id, userId: session.user.id },
    });
    revalidatePath("/profile");
    return { success: true };
  } catch (e) {
    console.error("[removeProgressPhoto]", e);
    return { error: "Ошибка" };
  }
}

// === Замеры ===

const measurementSchema = z.object({
  date: z.string().min(1), // yyyy-mm-dd
  shoulders: z.number().nullable().optional(),
  aboveChest: z.number().nullable().optional(),
  belowChest: z.number().nullable().optional(),
  waist: z.number().nullable().optional(),
  abdomen: z.number().nullable().optional(),
  hips: z.number().nullable().optional(),
  thighRight: z.number().nullable().optional(),
  thighLeft: z.number().nullable().optional(),
  calfRight: z.number().nullable().optional(),
  calfLeft: z.number().nullable().optional(),
  armRight: z.number().nullable().optional(),
  armLeft: z.number().nullable().optional(),
});

export async function addMeasurement(input: z.infer<typeof measurementSchema>) {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };
  try {
    const data = measurementSchema.parse(input);
    await prisma.userMeasurement.create({
      data: {
        userId: session.user.id,
        date: new Date(data.date),
        shoulders: data.shoulders ?? null,
        aboveChest: data.aboveChest ?? null,
        belowChest: data.belowChest ?? null,
        waist: data.waist ?? null,
        abdomen: data.abdomen ?? null,
        hips: data.hips ?? null,
        thighRight: data.thighRight ?? null,
        thighLeft: data.thighLeft ?? null,
        calfRight: data.calfRight ?? null,
        calfLeft: data.calfLeft ?? null,
        armRight: data.armRight ?? null,
        armLeft: data.armLeft ?? null,
      },
    });
    revalidatePath("/profile");
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[addMeasurement]", e);
    return { error: "Ошибка сохранения" };
  }
}

export async function deleteMeasurement(id: string) {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };
  try {
    await prisma.userMeasurement.deleteMany({
      where: { id, userId: session.user.id },
    });
    revalidatePath("/profile");
    return { success: true };
  } catch (e) {
    console.error("[deleteMeasurement]", e);
    return { error: "Ошибка" };
  }
}

export async function deleteOwnAccount() {
  const session = await requireUser();
  if (!session) return { error: "Нужно войти" };

  try {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true },
    });

    if (!me) return { error: "Пользователь не найден" };

    if (me.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return { error: "Нельзя удалить последнего админа" };
      }
    }

    await prisma.user.delete({ where: { id: session.user.id } });
    return { success: true };
  } catch (e) {
    console.error("[deleteOwnAccount]", e);
    return { error: "Ошибка удаления" };
  }
}
