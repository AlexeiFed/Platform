import type { ProductType } from "@prisma/client";

type ProductVisibilityInput = {
  type: ProductType;
  published: boolean;
  startDate: Date | string | null;
  deletedAt?: Date | string | null;
};

const getStartOfDay = (value: Date | string) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export function getMarathonHideAt(startDate: Date | string | null) {
  if (!startDate) {
    return null;
  }

  const hideAt = getStartOfDay(startDate);
  hideAt.setDate(hideAt.getDate() + 1);
  return hideAt;
}

export function isProductPubliclyVisible(product: ProductVisibilityInput) {
  if (product.deletedAt || !product.published) {
    return false;
  }

  if (product.type !== "MARATHON") {
    return true;
  }

  const hideAt = getMarathonHideAt(product.startDate);
  if (!hideAt) {
    return false;
  }

  return new Date() < hideAt;
}
