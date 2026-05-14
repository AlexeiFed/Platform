"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteObject, getPresignedDownloadUrl, getPublicUrl } from "@/lib/s3";
import { assertPreviewPageKeysUnderMaterial } from "@/lib/additional-material-preview-paths";
import { khabarovskDateInputToUtc } from "@/lib/timezone";
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
  previewPageKeys: string[] | null;
  visibilityFrom: string | null;
  createdAt: string;
};

function parsePreviewPageKeysJson(v: unknown): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  const a = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return a.length ? a : null;
}

function isPdfMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === "application/pdf" || m.includes("pdf");
}

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
      previewPageKeys: true,
      visibilityFrom: true,
      createdAt: true,
    },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      ...r,
      previewPageKeys: parsePreviewPageKeysJson(r.previewPageKeys),
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

  const visibilityFrom = khabarovskDateInputToUtc(parsed.visibilityFrom);
  if (parsed.visibilityFrom?.trim() && !visibilityFrom) {
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

  let visibilityFrom: Date | null | undefined;
  if (parsed.visibilityFrom === undefined) {
    visibilityFrom = undefined;
  } else if (!parsed.visibilityFrom?.trim()) {
    visibilityFrom = null;
  } else {
    visibilityFrom = khabarovskDateInputToUtc(parsed.visibilityFrom);
    if (!visibilityFrom) return { success: false, error: "Некорректная дата" };
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
    select: { productId: true, fileKey: true, coverKey: true, previewPageKeys: true },
  });
  if (!existing) return { success: false, error: "Не найдено" };

  const gate = await assertStaffProductAccess(existing.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  revalidatePath("/admin/additional-materials");
  const slugRow = await prisma.product.findUnique({
    where: { id: existing.productId },
    select: { slug: true },
  });
  if (slugRow) revalidatePath(`/learn/${slugRow.slug}/additional-materials`);
  return { success: true };
}

const setPreviewPagesSchema = z.object({
  id: z.string().uuid(),
  pageKeys: z.array(z.string().min(8)).min(1).max(60),
});

/** Сохранить сгенерированные в браузере WebP-страницы; старые ключи удаляются из S3. */
export async function setAdditionalMaterialPreviewPages(
  input: z.infer<typeof setPreviewPagesSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  let parsed: z.infer<typeof setPreviewPagesSchema>;
  try {
    parsed = setPreviewPagesSchema.parse(input);
  } catch {
    return { success: false, error: "Некорректные данные" };
  }

  const material = await prisma.productAdditionalMaterial.findUnique({
    where: { id: parsed.id },
    select: { productId: true, fileKey: true, previewPageKeys: true },
  });
  if (!material) return { success: false, error: "Не найдено" };

  const gate = await assertStaffProductAccess(material.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  if (!assertPreviewPageKeysUnderMaterial(material.fileKey, parsed.pageKeys)) {
    return { success: false, error: "Некорректные ключи файлов страниц" };
  }

  const oldPages = parsePreviewPageKeysJson(material.previewPageKeys);
  if (oldPages) {
    for (const key of oldPages) {
      if (parsed.pageKeys.includes(key)) continue;
      try {
        await deleteObject(key);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    await prisma.productAdditionalMaterial.update({
      where: { id: parsed.id },
      data: { previewPageKeys: parsed.pageKeys },
    });
  } catch {
    return { success: false, error: "Не удалось сохранить" };
  }

  revalidatePath("/admin/additional-materials");
  revalidatePath(`/admin/additional-materials/preview/${parsed.id}`);
  const slugRow = await prisma.product.findUnique({
    where: { id: material.productId },
    select: { slug: true },
  });
  if (slugRow) revalidatePath(`/learn/${slugRow.slug}/additional-materials`);
  return { success: true };
}

export async function getAdditionalMaterialStaffPreview(
  materialId: string
): Promise<
  | {
      success: true;
      title: string;
      mimeType: string;
      previewImageUrls: string[];
      pdfFallbackUrl: string | null;
    }
  | { success: false; error: string }
> {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { success: false, error: "Нет доступа" };
  }

  const parsedId = z.string().uuid().safeParse(materialId);
  if (!parsedId.success) return { success: false, error: "Некорректный id" };

  const material = await prisma.productAdditionalMaterial.findUnique({
    where: { id: parsedId.data },
    select: { productId: true, title: true, mimeType: true, fileKey: true, previewPageKeys: true },
  });
  if (!material) return { success: false, error: "Не найдено" };

  const gate = await assertStaffProductAccess(material.productId);
  if (!("session" in gate)) {
    return { success: false, error: "error" in gate ? gate.error : "Нет доступа" };
  }

  const keys = parsePreviewPageKeysJson(material.previewPageKeys);
  const previewImageUrls = keys?.map((k) => getPublicUrl(k)) ?? [];

  let pdfFallbackUrl: string | null = null;
  if (isPdfMime(material.mimeType)) {
    try {
      pdfFallbackUrl = await getPresignedDownloadUrl(material.fileKey, 3600);
    } catch {
      pdfFallbackUrl = null;
    }
  }

  return {
    success: true,
    title: material.title,
    mimeType: material.mimeType,
    previewImageUrls,
    pdfFallbackUrl,
  };
}
