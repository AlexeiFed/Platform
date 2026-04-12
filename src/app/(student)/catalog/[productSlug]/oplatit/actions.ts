"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/** Пользователь закрыл оплату без перевода — ЮMoney «отказ» по HTTP не шлёт. */
export async function cancelPendingPaymentByReference(paymentRef: string, productSlug: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };
  if (!paymentRef || paymentRef.length < 8) return { error: "Некорректная ссылка" };

  const payment = await prisma.payment.findFirst({
    where: {
      reference: paymentRef,
      userId: session.user.id,
      status: "PENDING",
      product: { slug: productSlug, deletedAt: null },
    },
    select: { id: true },
  });

  if (!payment) {
    return { error: "Активная заявка на оплату не найдена" };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${productSlug}`);
  revalidatePath(`/catalog/${productSlug}/oplatit`);
  return { success: true };
}
