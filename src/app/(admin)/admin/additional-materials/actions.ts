"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseMaterialFolder(fileKey: string, productId: string): string | null {
  const prefix = `courses/${productId}/additional-materials/`;
  if (!fileKey.startsWith(prefix) || fileKey.includes("..")) return null;
  const rest = fileKey.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const folder = rest.slice(0, slash);
  if (!UUID_RE.test(folder)) return null;
  return folder;
}

function assertKeysUnderMaterialFolder(
  productId: string,
  fileKey: string,
  coverKey: string | null | undefined
): { error: string } | { folder: string } {
  const folder = parseMaterialFolder(fileKey, productId);
  if (!folder) return { error: "Некорректный ключ файла" };
  if (coverKey) {
    const cf = parseMaterialFolder(coverKey, productId);
    if (cf !== folder) return { error: "Некорректный ключ обложки" };
  }
  return { folder };
}

async function assertStaffProductAccess(productId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Нет доступа" } as const;
  const role = session.user.role;
  if (role === "ADMIN") return { session } as const;
  if (role === "CURATOR") {
    const row = await prisma.productCurator.findUnique({
      where: { productId_curatorId: { productId, curatorId: session.user.id } },
      select: { id: true },
    });
    if (!row) return { error: "Нет доступа" } as const;
    return { session } as const;
  }
  return { error: "Нет доступа" } as const;
}

export type AdminMaterialRow = {
  id: string;
  title: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number | null;
  coverKey: string | null;
  visibilityFrom: string | null;
  createdAt: string;
};

export async function listAdditionalMaterialsAdmin(
  productId: string
): Promise<{ success: true; data: AdminMaterialRow[] } | { success: false; error: string }> {
  const gate = await assertStaffProductAccess(productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  const rows = await prisma.productAdditionalMaterial.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      fileKey: true,
      mimeType: true,
      sizeBytes: true,
      coverKey: true,
      visibilityFrom: true,
      createdAt: true,
    },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      ...r,
      visibilityFrom: r.visibilityFrom ? r.visibilityFrom.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

const createSchema = z.object({
  productId: z.string().uuid(),
  fileKey: z.string().min(3),
  coverKey: z.string().optional().nullable(),
  title: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().optional().nullable(),
  visibilityFrom: z.string().optional().nullable(),
});

export async function createAdditionalMaterial(
  input: z.infer<typeof createSchema>
): Promise<{ success: true; data: { id: string } } | { success: false; error: string }> {
  const gate = await assertStaffProductAccess(input.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(input);
  } catch {
    return { success: false, error: "Некорректные данные" };
  }

  const keyCheck = assertKeysUnderMaterialFolder(parsed.productId, parsed.fileKey, parsed.coverKey ?? null);
  if ("error" in keyCheck) return { success: false, error: keyCheck.error };

  const visibilityFrom =
    parsed.visibilityFrom?.trim() ?
      new Date(`${parsed.visibilityFrom.trim()}T00:00:00.000Z`)
    : null;
  if (visibilityFrom && Number.isNaN(visibilityFrom.getTime())) {
    return { success: false, error: "Некорректная дата видимости" };
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) return { success: false, error: "Продукт не найден" };

  try {
    const row = await prisma.productAdditionalMaterial.create({
      data: {
        productId: parsed.productId,
        title: parsed.title.trim(),
        fileKey: parsed.fileKey,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes ?? null,
        coverKey: parsed.coverKey?.trim() || null,
        visibilityFrom,
      },
      select: { id: true },
    });
    revalidatePath("/admin/additional-materials");
    const slugRow = await prisma.product.findUnique({
      where: { id: parsed.productId },
      select: { slug: true },
    });
    if (slugRow) revalidatePath(`/learn/${slugRow.slug}/additional-materials`);
    return { success: true, data: { id: row.id } };
  } catch {
    return { success: false, error: "Не удалось сохранить" };
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  visibilityFrom: z.string().optional().nullable(),
});

export async function updateAdditionalMaterial(
  input: z.infer<typeof updateSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  let parsed: z.infer<typeof updateSchema>;
  try {
    parsed = updateSchema.parse(input);
  } catch {
    return { success: false, error: "Некорректные данные" };
  }

  const existing = await prisma.productAdditionalMaterial.findUnique({
    where: { id: parsed.id },
    select: { productId: true },
  });
  if (!existing) return { success: false, error: "Не найдено" };

  const gate = await assertStaffProductAccess(existing.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  const visibilityFrom =
    parsed.visibilityFrom === undefined ? undefined
    : parsed.visibilityFrom?.trim() ?
      new Date(`${parsed.visibilityFrom.trim()}T00:00:00.000Z`)
    : null;
  if (visibilityFrom !== undefined && visibilityFrom !== null && Number.isNaN(visibilityFrom.getTime())) {
    return { success: false, error: "Некорректная дата" };
  }

  await prisma.productAdditionalMaterial.update({
    where: { id: parsed.id },
    data: {
      ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
      ...(visibilityFrom !== undefined ? { visibilityFrom } : {}),
    },
  });
  revalidatePath("/admin/additional-materials");
  const slugRow = await prisma.product.findUnique({
    where: { id: existing.productId },
    select: { slug: true },
  });
  if (slugRow) revalidatePath(`/learn/${slugRow.slug}/additional-materials`);
  return { success: true };
}

export async function deleteAdditionalMaterial(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const existing = await prisma.productAdditionalMaterial.findUnique({
    where: { id },
    select: { productId: true, fileKey: true, coverKey: true },
  });
  if (!existing) return { success: false, error: "Не найдено" };

  const gate = await assertStaffProductAccess(existing.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  await prisma.productAdditionalMaterial.delete({ where: { id } });

  try {
    await deleteObject(existing.fileKey);
  } catch {
    /* ignore */
  }
  if (existing.coverKey) {
    try {
      await deleteObject(existing.coverKey);
    } catch {
      /* ignore */
    }
  }

  revalidatePath("/admin/additional-materials");
  const slugRow = await prisma.product.findUnique({
    where: { id: existing.productId },
    select: { slug: true },
  });
  if (slugRow) revalidatePath(`/learn/${slugRow.slug}/additional-materials`);
  return { success: true };
}
