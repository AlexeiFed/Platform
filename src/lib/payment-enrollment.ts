import type { Prisma } from "@prisma/client";

export const defaultTariffIdForProductTx = async (
  tx: Prisma.TransactionClient,
  productId: string
): Promise<string | null> => {
  const row = await tx.productTariff.findFirst({
    where: { productId, published: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return row?.id ?? null;
};

type InitialPaymentRow = {
  userId: string;
  productId: string;
  tariffId: string | null;
};

/** Создаёт/обновляет запись после успешной первичной оплаты (не апгрейд). */
export const upsertEnrollmentAfterInitialPaymentTx = async (
  tx: Prisma.TransactionClient,
  payment: InitialPaymentRow
) => {
  const tariffId =
    payment.tariffId ?? (await defaultTariffIdForProductTx(tx, payment.productId));
  if (!tariffId) {
    return { ok: false as const, reason: "no_tariff" as const };
  }

  const existingEnrollment = await tx.enrollment.findUnique({
    where: {
      userId_productId: { userId: payment.userId, productId: payment.productId },
    },
    select: { id: true, tariffId: true },
  });

  const enrollment = await tx.enrollment.upsert({
    where: { userId_productId: { userId: payment.userId, productId: payment.productId } },
    create: { userId: payment.userId, productId: payment.productId, tariffId },
    update: { tariffId },
    select: { id: true, tariffId: true },
  });

  if (!existingEnrollment) {
    await tx.enrollmentTariffHistory.create({
      data: {
        enrollmentId: enrollment.id,
        fromTariffId: null,
        toTariffId: tariffId,
        reason: "payment",
      },
    });
  } else if (existingEnrollment.tariffId !== tariffId) {
    await tx.enrollmentTariffHistory.create({
      data: {
        enrollmentId: enrollment.id,
        fromTariffId: existingEnrollment.tariffId,
        toTariffId: tariffId,
        reason: "payment",
      },
    });
  }

  return { ok: true as const };
};
