import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPaidProduct } from "@/lib/product-payment";

const publishedTariffWhere = {
  published: true,
  deletedAt: null,
} satisfies Prisma.ProductTariffWhereInput;

export type ProductPricingSummary = {
  hasPublishedTariffs: boolean;
  publishedTariffsCount: number;
  minPrice: { price: number; currency: string } | null;
};

export const getProductPricingSummary = async (productId: string): Promise<ProductPricingSummary> => {
  const [count, cheapest] = await prisma.$transaction([
    prisma.productTariff.count({ where: { productId, ...publishedTariffWhere } }),
    prisma.productTariff.findFirst({
      where: { productId, ...publishedTariffWhere },
      orderBy: [{ price: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { price: true, currency: true },
    }),
  ]);

  if (count > 0) {
    return {
      hasPublishedTariffs: true,
      publishedTariffsCount: count,
      minPrice: cheapest ? { price: Number(cheapest.price), currency: cheapest.currency } : null,
    };
  }

  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { price: true, currency: true },
  });
  if (!p?.price) {
    return { hasPublishedTariffs: false, publishedTariffsCount: 0, minPrice: null };
  }
  return {
    hasPublishedTariffs: false,
    publishedTariffsCount: 0,
    minPrice: { price: Number(p.price), currency: p.currency },
  };
};

/** Минимальная цена среди опубликованных тарифов; если тарифов нет — legacy `product.price`. */
export const getProductMinPrice = async (productId: string): Promise<{ price: number; currency: string } | null> => {
  const summary = await getProductPricingSummary(productId);
  return summary.minPrice;
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
