import type { Prisma } from "@prisma/client";
import { amountsEqual } from "@/lib/product-payment";

type PaymentRow = {
  id: string;
  kind: "INITIAL" | "UPGRADE";
  userId: string;
  productId: string;
  tariffId: string | null;
};

/**
 * Если платёж — апгрейд тарифа, применяет смену тарифа. Иначе возвращает `skipped`.
 * Вызывать после перевода payment в SUCCEEDED.
 */
export const tryApplyTariffUpgradeFromPaymentTx = async (
  tx: Prisma.TransactionClient,
  payment: PaymentRow,
  paidBySender: number
): Promise<
  | { outcome: "skipped" }
  | { outcome: "bad_state" }
  | { outcome: "amount_mismatch" }
  | { outcome: "conflict" }
  | { outcome: "applied" }
> => {
  if (payment.kind !== "UPGRADE") {
    return { outcome: "skipped" };
  }

  const upgrade = await tx.tariffUpgrade.findUnique({
    where: { paymentId: payment.id },
    select: {
      id: true,
      status: true,
      enrollmentId: true,
      fromTariffId: true,
      toTariffId: true,
      quotedDelta: true,
      toTariff: { select: { criteria: true } },
    },
  });

  if (!upgrade) {
    return { outcome: "bad_state" };
  }

  if (upgrade.status !== "PENDING_PAYMENT") {
    return { outcome: "bad_state" };
  }

  if (!amountsEqual(upgrade.quotedDelta, paidBySender)) {
    return { outcome: "amount_mismatch" };
  }

  const enrollment = await tx.enrollment.findUnique({
    where: { id: upgrade.enrollmentId },
    select: { id: true, tariffId: true },
  });
  if (!enrollment || enrollment.tariffId !== upgrade.fromTariffId) {
    return { outcome: "conflict" };
  }

  await tx.tariffUpgrade.update({
    where: { id: upgrade.id },
    data: {
      status: "APPLIED",
      appliedCriteriaSnapshot: upgrade.toTariff.criteria,
    },
  });

  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: { tariffId: upgrade.toTariffId },
  });

  await tx.enrollmentTariffHistory.create({
    data: {
      enrollmentId: enrollment.id,
      fromTariffId: upgrade.fromTariffId,
      toTariffId: upgrade.toTariffId,
      reason: "upgrade_payment",
    },
  });

  return { outcome: "applied" as const };
};
