"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl, getPublicUrl } from "@/lib/s3";

export type StudentMaterialRow = {
  id: string;
  title: string;
  fileKey: string;
  mimeType: string;
  coverKey: string | null;
  /** Если задано — студент видит готовые картинки без pdf.js. */
  previewPageKeys: string[] | null;
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
      previewPageKeys: true,
    },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      title: r.title,
      fileKey: r.fileKey,
      mimeType: r.mimeType,
      coverKey: r.coverKey,
      previewPageKeys: parseStudentPreviewKeys(r.previewPageKeys),
    })),
  };
}

function parseStudentPreviewKeys(v: unknown): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  const a = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return a.length ? a : null;
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

function isPdfMimeType(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === "application/pdf" || m.includes("pdf");
}

export type StudentMaterialViewerPayload =
  | { kind: "images"; title: string; imageUrls: string[] }
  | { kind: "pdf"; title: string; pdfUrl: string };

/** Просмотр доп. материала: готовые страницы или PDF в браузере. */
export async function getStudentAdditionalMaterialViewer(
  courseSlug: string,
  materialId: string
): Promise<{ success: true; data: StudentMaterialViewerPayload } | { success: false; error: string }> {
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
      mimeType: true,
      previewPageKeys: true,
    },
  });
  if (!material) return { success: false, error: "Файл не найден" };

  const now = new Date();
  if (material.visibilityFrom && material.visibilityFrom > now) {
    return { success: false, error: "Материал ещё недоступен" };
  }

  if (!isPdfMimeType(material.mimeType)) {
    return { success: false, error: "Просмотр доступен только для PDF" };
  }

  const keys = parseStudentPreviewKeys(material.previewPageKeys);
  if (keys && keys.length > 0) {
    return {
      success: true,
      data: {
        kind: "images",
        title: material.title,
        imageUrls: keys.map((k) => getPublicUrl(k)),
      },
    };
  }

  const pdfUrl = await getPresignedDownloadUrl(material.fileKey, 3600);
  return {
    success: true,
    data: { kind: "pdf", title: material.title, pdfUrl },
  };
}
