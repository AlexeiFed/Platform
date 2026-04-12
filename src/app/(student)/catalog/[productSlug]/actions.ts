"use server";

import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendPaymentRefToFormUrl, isPaidProduct } from "@/lib/product-payment";
import { revalidatePath } from "next/cache";

export async function enrollToProduct(productId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { price: true, slug: true },
    });
    if (!product) return { error: "Продукт не найден" };

    if (!isPaidProduct(product.price)) {
      await prisma.enrollment.upsert({
        where: { userId_productId: { userId: session.user.id, productId } },
        create: { userId: session.user.id, productId },
        update: {},
      });
      revalidatePath("/catalog");
      revalidatePath(`/catalog/${product.slug}`);
      revalidatePath(`/learn/${product.slug}`);
      return { success: true };
    }

    const succeeded = await prisma.payment.findFirst({
      where: { userId: session.user.id, productId, status: "SUCCEEDED" },
      select: { id: true },
    });
    if (!succeeded) {
      return {
        error:
          "Для платного курса нужна оплата. После перевода нажмите «Проверить доступ» — запись появится автоматически.",
      };
    }

    await prisma.enrollment.upsert({
      where: { userId_productId: { userId: session.user.id, productId } },
      create: { userId: session.user.id, productId },
      update: {},
    });

    revalidatePath("/catalog");
    revalidatePath(`/catalog/${product.slug}`);
    revalidatePath(`/learn/${product.slug}`);
    return { success: true };
  } catch (error) {
    console.error("[enrollToProduct]", error);
    return { error: "Произошла ошибка" };
  }
}

/** Создаёт PENDING-платёж и отдаёт либо путь на нашу страницу QuickPay (ЮMoney), либо URL внешней формы. */
export async function createExternalFormCheckout(productId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        price: true,
        currency: true,
        paymentFormUrl: true,
        published: true,
        slug: true,
      },
    });

    if (!product) return { error: "Продукт не найден" };
    if (!product.published) return { error: "Продукт недоступен" };
    if (!isPaidProduct(product.price)) return { error: "Этот продукт бесплатный — запишитесь кнопкой «Записаться»" };

    const yoomoneyReceiver = process.env.YOOMONEY_WALLET_RECEIVER?.trim();
    const formUrl = product.paymentFormUrl?.trim();

    if (!yoomoneyReceiver && !formUrl) {
      return {
        error:
          "Оплата не настроена: на сервере нет YOOMONEY_WALLET_RECEIVER и в курсе нет ссылки на форму. Обратитесь к администратору.",
      };
    }

    if (!yoomoneyReceiver && formUrl && !URL.canParse(formUrl)) {
      return { error: "Некорректная ссылка на форму оплаты" };
    }

    await prisma.payment.updateMany({
      where: { userId: session.user.id, productId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    const reference = randomBytes(16).toString("hex");

    await prisma.payment.create({
      data: {
        reference,
        userId: session.user.id,
        productId,
        amount: product.price!,
        currency: product.currency,
        status: "PENDING",
      },
    });

    revalidatePath("/catalog");
    revalidatePath(`/catalog/${product.slug}`);

    if (yoomoneyReceiver) {
      const oplatitPath = `/catalog/${product.slug}/oplatit?paymentRef=${encodeURIComponent(reference)}`;
      return { success: true, data: { mode: "yoomoney" as const, oplatitPath } };
    }

    const checkoutUrl = appendPaymentRefToFormUrl(formUrl!, reference);
    return { success: true, data: { mode: "external_form" as const, checkoutUrl } };
  } catch (error) {
    console.error("[createExternalFormCheckout]", error);
    return { error: "Произошла ошибка" };
  }
}
