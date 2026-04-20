"use server";

import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appendPaymentRefToFormUrl, isPaidProduct } from "@/lib/product-payment";

const createUpgradeSchema = z.object({
  enrollmentId: z.string().uuid(),
  toTariffId: z.string().uuid(),
});

/** Создаёт заявку на апгрейд и PENDING-платёж на разницу (ЮMoney / внешняя форма). */
export async function createTariffUpgradeCheckout(input: z.infer<typeof createUpgradeSchema>) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти" };

  try {
    const data = createUpgradeSchema.parse(input);

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId, userId: session.user.id },
      include: {
        tariff: { select: { id: true, price: true, currency: true, productId: true, sortOrder: true } },
        product: {
          select: { slug: true, published: true, paymentFormUrl: true },
        },
      },
    });
    if (!enrollment) return { error: "Запись не найдена" };
    if (!enrollment.product.published) return { error: "Продукт недоступен" };

    const toTariff = await prisma.productTariff.findFirst({
      where: {
        id: data.toTariffId,
        productId: enrollment.productId,
        published: true,
        deletedAt: null,
      },
      select: { id: true, price: true, currency: true, sortOrder: true },
    });
    if (!toTariff) return { error: "Тариф не найден" };

    const fromPrice = Number(enrollment.tariff.price);
    const toPrice = Number(toTariff.price);
    if (toTariff.sortOrder <= enrollment.tariff.sortOrder) {
      return { error: "Можно перейти только на тариф с более высоким уровнем" };
    }
    if (toPrice <= fromPrice) {
      return { error: "Можно перейти только на более дорогой тариф" };
    }

    const delta = toPrice - fromPrice;
    if (!isPaidProduct(delta)) {
      return { error: "Доплата не требуется" };
    }

    await prisma.tariffUpgrade.updateMany({
      where: { enrollmentId: enrollment.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });

    await prisma.payment.updateMany({
      where: {
        userId: session.user.id,
        productId: enrollment.productId,
        status: "PENDING",
      },
      data: { status: "CANCELLED" },
    });

    const reference = randomBytes(16).toString("hex");

    const payment = await prisma.payment.create({
      data: {
        reference,
        userId: session.user.id,
        productId: enrollment.productId,
        kind: "UPGRADE",
        amount: delta,
        currency: toTariff.currency,
        status: "PENDING",
      },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.tariffUpgrade.create({
      data: {
        enrollmentId: enrollment.id,
        fromTariffId: enrollment.tariff.id,
        toTariffId: toTariff.id,
        status: "PENDING_PAYMENT",
        quotedFromPrice: enrollment.tariff.price,
        quotedToPrice: toTariff.price,
        quotedDelta: delta,
        currency: toTariff.currency,
        paymentId: payment.id,
        expiresAt,
      },
    });

    const yoomoneyReceiver = process.env.YOOMONEY_WALLET_RECEIVER?.trim();
    const formUrl = enrollment.product.paymentFormUrl?.trim();

    if (!yoomoneyReceiver && !formUrl) {
      return { error: "Оплата не настроена" };
    }

    revalidatePath(`/learn/${enrollment.product.slug}/upgrade`);
    revalidatePath(`/learn/${enrollment.product.slug}`);

    if (yoomoneyReceiver) {
      const oplatitPath = `/catalog/${enrollment.product.slug}/oplatit?paymentRef=${encodeURIComponent(reference)}`;
      return { success: true, data: { mode: "yoomoney" as const, oplatitPath } };
    }

    const checkoutUrl = appendPaymentRefToFormUrl(formUrl!, reference);
    return { success: true, data: { mode: "external_form" as const, checkoutUrl } };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[createTariffUpgradeCheckout]", e);
    return { error: "Ошибка" };
  }
}
