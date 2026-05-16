"use server";

import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { syncMarathonEnrollmentProgress, syncMarathonProductEnrollmentsProgress } from "@/lib/marathon-progress-server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const marathonEventTypeSchema = z.enum([
  "INFO",
  "TRAINING",
  "NUTRITION",
  "PROCEDURE",
  "BONUS",
  "LIVE",
  "RESULT",
]);

const marathonTrackSchema = z.enum(["ALL", "HOME", "GYM"]);

const contentBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "video", "image"]),
  content: z.string(),
});

const marathonEventSchema = z.object({
  title: z.string().trim().min(1, "Укажите название события"),
  description: z.string().trim().optional(),
  type: marathonEventTypeSchema,
  track: marathonTrackSchema.default("ALL"),
  dayOffset: z.coerce.number().int().min(0, "День марафона не может быть отрицательным"),
  scheduledAt: z.string().optional(),
  weekNumber: z.coerce.number().int().min(0, "Неделя не может быть отрицательной (0 — подготовительный этап)").optional(),
  position: z.coerce.number().int().min(0).optional(),
  /** Порядок в списке = порядок уроков в программе (сервер сортирует по `lesson.order`). */
  lessonIds: z.array(z.string().uuid()).max(50).optional().default([]),
  blocks: z.array(contentBlockSchema).optional(),
  published: z.boolean().default(false),
});

const reorderMarathonEventsSchema = z.array(
  z.object({
    id: z.string().min(1),
    dayOffset: z.coerce.number().int().min(0),
    position: z.coerce.number().int().min(0),
  })
).min(1, "Нет событий для сортировки");

const procedureTypeSchema = z.object({
  title: z.string().trim().min(1, "Укажите название процедуры"),
});

const userProcedureSchema = z.object({
  enrollmentId: z.string().min(1),
  procedureTypeId: z.string().min(1),
  scheduledAt: z.string().optional(),
  completedAt: z.string().optional(),
  notes: z.string().trim().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

const userProcedureUpdateSchema = z.object({
  procedureTypeId: z.string().min(1).optional(),
  scheduledAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

import { parseOptionalDateTimeLocalInMarathonZone as parseOptionalDate } from "@/lib/marathon-datetime";

const assertAdminOrCurator = async () => {
  const session = await auth();

  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return null;
  }

  return session;
};

const getProductRevalidationData = async (productId: string) => {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, type: true },
  });
};

const revalidateMarathonProductPaths = (product: { id: string; slug: string }) => {
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${product.id}`);
  revalidatePath("/admin/live");
  revalidatePath("/catalog");
  revalidatePath(`/catalog/${product.slug}`);
  revalidatePath(`/learn/${product.slug}`);
  revalidatePath("/dashboard");
};

const resolveLessonIdsForProduct = async (
  productId: string,
  lessonIds: string[] | undefined
): Promise<{ ids: string[] } | { error: string }> => {
  const unique = [...new Set((lessonIds ?? []).filter(Boolean))];
  if (unique.length === 0) {
    return { ids: [] };
  }

  const lessons = await prisma.lesson.findMany({
    where: { productId, id: { in: unique } },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });

  if (lessons.length !== unique.length) {
    return { error: "Один из уроков не найден или не относится к этому марафону" };
  }

  return { ids: lessons.map((l) => l.id) };
};

const ensureMarathonProduct = async (productId: string) => {
  const product = await getProductRevalidationData(productId);

  if (!product) {
    return { error: "Марафон не найден" as const };
  }

  if (product.type !== "MARATHON") {
    return { error: "Расписание доступно только для марафонов" as const };
  }

  return { product };
};

const buildMarathonEventFields = (
  productId: string,
  input: z.infer<typeof marathonEventSchema>
): Prisma.MarathonEventUncheckedCreateInput => ({
  productId,
  title: input.title,
  description: input.description || null,
  type: input.type,
  track: input.track,
  dayOffset: input.dayOffset,
  scheduledAt: parseOptionalDate(input.scheduledAt),
  weekNumber: input.weekNumber ?? null,
  position: input.position ?? 0,
  blocks: input.blocks ?? undefined,
  published: input.published,
});

const replaceEventLessons = async (
  tx: Prisma.TransactionClient,
  marathonEventId: string,
  lessonIds: string[]
) => {
  await tx.marathonEventLesson.deleteMany({ where: { marathonEventId } });
  if (lessonIds.length === 0) return;
  await tx.marathonEventLesson.createMany({
    data: lessonIds.map((lessonId, position) => ({
      marathonEventId,
      lessonId,
      position,
    })),
  });
};

const getEnrollmentRevalidationData = async (enrollmentId: string) => {
  return prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      product: {
        select: {
          id: true,
          slug: true,
          type: true,
        },
      },
    },
  });
};

const revalidateProcedurePaths = (data: {
  userId: string;
  productId: string;
  productSlug: string;
}) => {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${data.userId}`);
  revalidatePath(`/admin/courses/${data.productId}`);
  revalidatePath(`/learn/${data.productSlug}`);
  revalidatePath("/dashboard");
};

export async function createMarathonEvent(
  productId: string,
  input: z.infer<typeof marathonEventSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const productResult = await ensureMarathonProduct(productId);
    if ("error" in productResult) return productResult;

    const data = marathonEventSchema.parse(input);
    const lessonResult = await resolveLessonIdsForProduct(productId, data.lessonIds);
    if ("error" in lessonResult) return lessonResult;

    const fields = buildMarathonEventFields(productId, data);

    if (data.position === undefined) {
      const maxPosition = await prisma.marathonEvent.aggregate({
        where: {
          productId,
          dayOffset: data.dayOffset,
        },
        _max: { position: true },
      });

      fields.position = (maxPosition._max.position ?? -1) + 1;
    }

    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.marathonEvent.create({
        data: fields,
        select: { id: true },
      });
      if (lessonResult.ids.length > 0) {
        await tx.marathonEventLesson.createMany({
          data: lessonResult.ids.map((lessonId, position) => ({
            marathonEventId: ev.id,
            lessonId,
            position,
          })),
        });
      }
      return ev;
    });

    await syncMarathonProductEnrollmentsProgress(productId);
    revalidateMarathonProductPaths(productResult.product);

    return { success: true, data: { id: event.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

export async function updateMarathonEvent(
  eventId: string,
  input: z.infer<typeof marathonEventSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const currentEvent = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        productId: true,
      },
    });

    if (!currentEvent) {
      return { error: "Событие не найдено" };
    }

    const productResult = await ensureMarathonProduct(currentEvent.productId);
    if ("error" in productResult) return productResult;

    const data = marathonEventSchema.parse(input);
    const lessonResult = await resolveLessonIdsForProduct(currentEvent.productId, data.lessonIds);
    if ("error" in lessonResult) return lessonResult;

    const fields = buildMarathonEventFields(currentEvent.productId, data);

    await prisma.$transaction(async (tx) => {
      await replaceEventLessons(tx, eventId, lessonResult.ids);
      await tx.marathonEvent.update({
        where: { id: eventId },
        data: fields,
      });
    });

    await syncMarathonProductEnrollmentsProgress(currentEvent.productId);
    revalidateMarathonProductPaths(productResult.product);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

export async function deleteMarathonEvent(eventId: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const event = await prisma.marathonEvent.delete({
      where: { id: eventId },
      select: {
        productId: true,
      },
    });

    const productResult = await ensureMarathonProduct(event.productId);
    if ("error" in productResult) return productResult;

    await syncMarathonProductEnrollmentsProgress(event.productId);
    revalidateMarathonProductPaths(productResult.product);

    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function reorderMarathonEvents(
  productId: string,
  items: z.infer<typeof reorderMarathonEventsSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const productResult = await ensureMarathonProduct(productId);
    if ("error" in productResult) return productResult;

    const data = reorderMarathonEventsSchema.parse(items);

    await prisma.$transaction(
      data.map((item) =>
        prisma.marathonEvent.update({
          where: { id: item.id },
          data: {
            dayOffset: item.dayOffset,
            position: item.position,
          },
        })
      )
    );

    revalidateMarathonProductPaths(productResult.product);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

export async function createProcedureType(input: z.infer<typeof procedureTypeSchema>) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const data = procedureTypeSchema.parse(input);

    const existing = await prisma.procedureType.findUnique({
      where: { title: data.title },
      select: { id: true },
    });

    if (existing) {
      return { error: "Процедура с таким названием уже существует" };
    }

    const procedureType = await prisma.procedureType.create({
      data: {
        title: data.title,
      },
      select: { id: true, title: true },
    });

    revalidatePath("/admin/users");

    return { success: true, data: procedureType };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

export async function deleteProcedureType(id: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    await prisma.procedureType.delete({ where: { id } });
    revalidatePath("/admin/users");
    return { success: true };
  } catch {
    return { error: "Нельзя удалить — тип используется в процедурах студентов" };
  }
}

export async function assignProcedureToEnrollment(
  input: z.infer<typeof userProcedureSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const data = userProcedureSchema.parse(input);

    const enrollment = await getEnrollmentRevalidationData(data.enrollmentId);
    if (!enrollment) {
      return { error: "Запись участника не найдена" };
    }

    if (enrollment.product.type !== "MARATHON") {
      return { error: "Процедуры можно назначать только участникам марафона" };
    }

    const procedureType = await prisma.procedureType.findUnique({
      where: { id: data.procedureTypeId },
      select: { id: true },
    });

    if (!procedureType) {
      return { error: "Тип процедуры не найден" };
    }

    const maxPosition = await prisma.userMarathonProcedure.aggregate({
      where: { enrollmentId: data.enrollmentId },
      _max: { position: true },
    });

    const procedure = await prisma.userMarathonProcedure.create({
      data: {
        enrollmentId: data.enrollmentId,
        procedureTypeId: data.procedureTypeId,
        scheduledAt: parseOptionalDate(data.scheduledAt),
        completedAt: parseOptionalDate(data.completedAt),
        notes: data.notes || null,
        position: data.position ?? (maxPosition._max.position ?? -1) + 1,
      },
      select: { id: true },
    });

    await syncMarathonEnrollmentProgress(data.enrollmentId);
    revalidateProcedurePaths({
      userId: enrollment.userId,
      productId: enrollment.product.id,
      productSlug: enrollment.product.slug,
    });

    return { success: true, data: { id: procedure.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

export async function updateUserProcedure(
  procedureId: string,
  input: z.infer<typeof userProcedureUpdateSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const data = userProcedureUpdateSchema.parse(input);

    const currentProcedure = await prisma.userMarathonProcedure.findUnique({
      where: { id: procedureId },
      select: {
        id: true,
        enrollmentId: true,
      },
    });

    if (!currentProcedure) {
      return { error: "Процедура участника не найдена" };
    }

    const enrollment = await getEnrollmentRevalidationData(currentProcedure.enrollmentId);
    if (!enrollment) {
      return { error: "Запись участника не найдена" };
    }

    if (enrollment.product.type !== "MARATHON") {
      return { error: "Процедуры можно редактировать только у участников марафона" };
    }

    if (data.procedureTypeId) {
      const procedureType = await prisma.procedureType.findUnique({
        where: { id: data.procedureTypeId },
        select: { id: true },
      });

      if (!procedureType) {
        return { error: "Тип процедуры не найден" };
      }
    }

    await prisma.userMarathonProcedure.update({
      where: { id: procedureId },
      data: {
        procedureTypeId: data.procedureTypeId,
        scheduledAt: data.scheduledAt === undefined ? undefined : parseOptionalDate(data.scheduledAt),
        completedAt: data.completedAt === undefined ? undefined : parseOptionalDate(data.completedAt),
        notes: data.notes === undefined ? undefined : data.notes || null,
        position: data.position,
      },
    });

    await syncMarathonEnrollmentProgress(currentProcedure.enrollmentId);
    revalidateProcedurePaths({
      userId: enrollment.userId,
      productId: enrollment.product.id,
      productSlug: enrollment.product.slug,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}

/** Возвращает список всех типов процедур */
export async function getAllProcedureTypes() {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };
  try {
    const types = await prisma.procedureType.findMany({ orderBy: { title: "asc" } });
    return { success: true, data: types.map((t) => ({ id: t.id, title: t.title })) };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

/** Возвращает всех участников марафона с их процедурами для массового управления */
export async function getProductEnrollmentsForProcedures(productId: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { productId, product: { type: "MARATHON" } },
      select: {
        id: true,
        user: { select: { id: true, name: true, email: true } },
        procedures: {
          select: {
            id: true,
            scheduledAt: true,
            completedAt: true,
            notes: true,
            procedureType: { select: { id: true, title: true } },
          },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: enrollments.map((e) => ({
        id: e.id,
        user: e.user,
        procedureCount: e.procedures.length,
        completedCount: e.procedures.filter((p) => p.completedAt).length,
        procedures: e.procedures.map((p) => ({
          id: p.id,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          completedAt: p.completedAt?.toISOString() ?? null,
          notes: p.notes ?? null,
          procedureType: p.procedureType,
        })),
      })),
    };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

const bulkAssignSchema = z.object({
  productId: z.string().min(1),
  enrollmentIds: z.array(z.string().min(1)).min(1, "Выберите хотя бы одного студента"),
  procedureTypeId: z.string().min(1),
  scheduledAt: z.string().optional(),
  notes: z.string().trim().optional(),
});

/** Массово назначает процедуру нескольким (или всем) участникам марафона */
export async function assignProcedureBulk(input: z.infer<typeof bulkAssignSchema>) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const data = bulkAssignSchema.parse(input);

    const productResult = await ensureMarathonProduct(data.productId);
    if ("error" in productResult) return { error: productResult.error };

    const procedureType = await prisma.procedureType.findUnique({
      where: { id: data.procedureTypeId },
      select: { id: true },
    });
    if (!procedureType) return { error: "Тип процедуры не найден" };

    // Проверяем что все enrollment принадлежат этому продукту
    const found = await prisma.enrollment.findMany({
      where: { id: { in: data.enrollmentIds }, productId: data.productId },
      select: { id: true },
    });
    if (found.length !== data.enrollmentIds.length) {
      return { error: "Некоторые участники не найдены в этом марафоне" };
    }

    // Создаём процедуры для каждого участника в транзакции
    await prisma.$transaction(async (tx) => {
      for (const enrollmentId of data.enrollmentIds) {
        const maxPos = await tx.userMarathonProcedure.aggregate({
          where: { enrollmentId },
          _max: { position: true },
        });
        await tx.userMarathonProcedure.create({
          data: {
            enrollmentId,
            procedureTypeId: data.procedureTypeId,
            scheduledAt: parseOptionalDate(data.scheduledAt),
            completedAt: null,
            notes: data.notes || null,
            position: (maxPos._max.position ?? -1) + 1,
          },
        });
      }
    });

    await Promise.all(data.enrollmentIds.map((id) => syncMarathonEnrollmentProgress(id)));
    revalidateMarathonProductPaths(productResult.product);
    revalidatePath("/admin/users");

    return { success: true, data: { count: data.enrollmentIds.length } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }
    return { error: "Произошла ошибка" };
  }
}

export async function deleteUserProcedure(procedureId: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const procedure = await prisma.userMarathonProcedure.delete({
      where: { id: procedureId },
      select: {
        enrollmentId: true,
      },
    });

    const enrollment = await getEnrollmentRevalidationData(procedure.enrollmentId);
    if (!enrollment) {
      return { error: "Запись участника не найдена" };
    }

    await syncMarathonEnrollmentProgress(procedure.enrollmentId);
    revalidateProcedurePaths({
      userId: enrollment.userId,
      productId: enrollment.product.id,
      productSlug: enrollment.product.slug,
    });

    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}
