import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPaidProduct } from "@/lib/product-payment";

const publishedTariffWhere = {
  published: true,
  deletedAt: null,
} satisfies Prisma.ProductTariffWhereInput;

/** Минимальная цена среди опубликованных тарифов; если тарифов нет — legacy `product.price`. */
export const getProductMinPrice = async (productId: string): Promise<{ price: number; currency: string } | null> => {
  const cheapest = await prisma.productTariff.findFirst({
    where: { productId, ...publishedTariffWhere },
    orderBy: [{ price: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { price: true, currency: true },
  });
  if (cheapest) {
    return { price: Number(cheapest.price), currency: cheapest.currency };
  }

  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { price: true, currency: true },
  });
  if (!p?.price) return null;
  return { price: Number(p.price), currency: p.currency };
};

export const isProductPaidForCatalog = async (productId: string): Promise<boolean> => {
  const min = await getProductMinPrice(productId);
  return min != null && isPaidProduct(min.price);
};

/** Первый опубликованный тариф (для legacy-платежей без tariffId). */
export const getDefaultTariffForProduct = async (productId: string) =>
  prisma.productTariff.findFirst({
    where: { productId, ...publishedTariffWhere },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, price: true, currency: true, criteria: true },
  });
