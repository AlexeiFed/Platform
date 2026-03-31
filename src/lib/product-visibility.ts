import type { ProductType } from "@prisma/client";

type ProductVisibilityInput = {
  type: ProductType;
  published: boolean;
  startDate: Date | string | null;
  durationDays?: number | null;
  deletedAt?: Date | string | null;
};

const getStartOfDay = (value: Date | string) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export function getMarathonHideAt(
  startDate: Date | string | null,
  durationDays?: number | null
) {
  if (!startDate) {
    return null;
  }

  const hideAt = getStartOfDay(startDate);

  if (!durationDays || durationDays < 1) {
    return null;
  }

  hideAt.setDate(hideAt.getDate() + durationDays);
  return hideAt;
}

export function isProductPubliclyVisible(product: ProductVisibilityInput) {
  if (product.deletedAt || !product.published) {
    return false;
  }

  if (product.type !== "MARATHON") {
    return true;
  }

  if (!product.startDate) {
    return false;
  }

  const hideAt = getMarathonHideAt(product.startDate, product.durationDays);
  if (!hideAt) {
    return true;
  }

  return new Date() < hideAt;
}
