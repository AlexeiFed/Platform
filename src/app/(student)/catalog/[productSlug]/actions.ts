"use server";

import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendPaymentRefToFormUrl, isPaidProduct } from "@/lib/product-payment";
import { revalidatePath } from "next/cache";
import { isProductPaidForCatalog, getDefaultTariffForProduct } from "@/lib/product-tariff-pricing";

const resolveTariffForSucceededPayment = async (userId: string, productId: string) => {
  const pay = await prisma.payment.findFirst({
    where: { userId, productId, status: "SUCCEEDED", kind: "INITIAL" },
    orderBy: { updatedAt: "desc" },
    select: { tariffId: true },
  });
  if (pay?.tariffId) return pay.tariffId;
  const def = await getDefaultTariffForProduct(productId);
  return def?.id ?? null;
};

export async function enrollToProduct(productId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { slug: true },
    });
    if (!product) return { error: "Продукт не найден" };

    const paid = await isProductPaidForCatalog(productId);

    if (!paid) {
      const freeTariff = await prisma.productTariff.findFirst({
        where: { productId, published: true, deletedAt: null, price: 0 },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (!freeTariff) {
        return { error: "Нет бесплатного тарифа (цена 0). Добавьте тариф в админке." };
      }
      await prisma.enrollment.upsert({
        where: { userId_productId: { userId: session.user.id, productId } },
        create: { userId: session.user.id, productId, tariffId: freeTariff.id },
        update: { tariffId: freeTariff.id },
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

    const tariffId = await resolveTariffForSucceededPayment(session.user.id, productId);
    if (!tariffId) {
      return { error: "Не удалось определить тариф. Обратитесь к администратору." };
    }

    await prisma.enrollment.upsert({
      where: { userId_productId: { userId: session.user.id, productId } },
      create: { userId: session.user.id, productId, tariffId },
      update: { tariffId },
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
export async function createExternalFormCheckout(productId: string, tariffId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        paymentFormUrl: true,
        published: true,
        slug: true,
      },
    });

    if (!product) return { error: "Продукт не найден" };
    if (!product.published) return { error: "Продукт недоступен" };

    const tariff = await prisma.productTariff.findFirst({
      where: {
        id: tariffId,
        productId,
        published: true,
        deletedAt: null,
      },
      select: { price: true, currency: true },
    });
    if (!tariff) return { error: "Тариф не найден или снят с публикации" };
    if (!isPaidProduct(tariff.price)) {
      return { error: "Для бесплатного тарифа нажмите «Записаться»" };
    }

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
        kind: "INITIAL",
        tariffId,
        amount: tariff.price,
        currency: tariff.currency,
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
