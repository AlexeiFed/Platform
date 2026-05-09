"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl } from "@/lib/s3";

export type StudentMaterialRow = {
  id: string;
  title: string;
  fileKey: string;
  mimeType: string;
  coverKey: string | null;
};

export async function listStudentAdditionalMaterials(
  courseSlug: string
): Promise<{ success: true; data: StudentMaterialRow[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Нет доступа" };

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!product) return { success: false, error: "Курс не найден" };

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    select: { id: true },
  });
  if (!enrollment) return { success: false, error: "Нет доступа" };

  const now = new Date();
  const rows = await prisma.productAdditionalMaterial.findMany({
    where: {
      productId: product.id,
      OR: [{ visibilityFrom: null }, { visibilityFrom: { lte: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      fileKey: true,
      mimeType: true,
      coverKey: true,
    },
  });

  return { success: true, data: rows };
}

export async function getAdditionalMaterialDownloadUrl(
  courseSlug: string,
  materialId: string
): Promise<{ success: true; url: string; fileName: string } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Нет доступа" };

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!product) return { success: false, error: "Курс не найден" };

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    select: { id: true },
  });
  if (!enrollment) return { success: false, error: "Нет доступа" };

  const material = await prisma.productAdditionalMaterial.findFirst({
    where: { id: materialId, productId: product.id },
    select: {
      fileKey: true,
      title: true,
      visibilityFrom: true,
    },
  });
  if (!material) return { success: false, error: "Файл не найден" };

  const now = new Date();
  if (material.visibilityFrom && material.visibilityFrom > now) {
    return { success: false, error: "Материал ещё недоступен" };
  }

  const url = await getPresignedDownloadUrl(material.fileKey, 3600);
  const safeName = material.title.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180) || "download";
  const extGuess = material.fileKey.includes(".") ? material.fileKey.slice(material.fileKey.lastIndexOf(".")) : "";
  const fileName =
    extGuess && !safeName.toLowerCase().endsWith(extGuess.toLowerCase()) ? `${safeName}${extGuess}` : safeName;

  return { success: true, url, fileName };
}
