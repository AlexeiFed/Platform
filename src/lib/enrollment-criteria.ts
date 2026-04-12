import type { Prisma, ProductCriterion } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ALL_PRODUCT_CRITERIA } from "@/lib/product-criteria";

const tariffCriteriaSelect = {
  tariff: { select: { criteria: true } },
  product: { select: { enabledCriteria: true } },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentForCriteria = Prisma.EnrollmentGetPayload<{
  select: typeof tariffCriteriaSelect;
}>;

/** Эффективные критерии записи: пересечение тарифа и whitelist продукта. */
export const effectiveCriteriaSet = (enrollment: EnrollmentForCriteria): Set<ProductCriterion> => {
  const enabled =
    enrollment.product.enabledCriteria.length > 0
      ? enrollment.product.enabledCriteria
      : ALL_PRODUCT_CRITERIA;
  const allow = new Set(enabled);
  return new Set(enrollment.tariff.criteria.filter((c) => allow.has(c)));
};

export const enrollmentHasCriterion = (
  enrollment: EnrollmentForCriteria,
  criterion: ProductCriterion
): boolean => effectiveCriteriaSet(enrollment).has(criterion);

export const loadEnrollmentForCriteria = async (enrollmentId: string) =>
  prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: tariffCriteriaSelect,
  });

export const loadEnrollmentForCriteriaByUserProduct = async (userId: string, productId: string) =>
  prisma.enrollment.findUnique({
    where: { userId_productId: { userId, productId } },
    select: tariffCriteriaSelect,
  });

export const loadEnrollmentForCriteria = async (enrollmentId: string) =>
  prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: tariffCriteriaSelect,
  });
