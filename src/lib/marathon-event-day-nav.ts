import type { MarathonEventType, ProductCriterion } from "@prisma/client";
import { isMarathonEventAccessible } from "@/lib/marathon-progress";
import { criterionForMarathonEventType } from "@/lib/product-criteria";

export type MarathonNavEventLite = {
  id: string;
  dayOffset: number;
  position: number;
  type: MarathonEventType;
};

const isEventNavigable = (
  ev: MarathonNavEventLite,
  product: { startDate: Date | null },
  criteria: Set<ProductCriterion>
): boolean => {
  const dateOk =
    !product.startDate ||
    isMarathonEventAccessible({ startDate: product.startDate, dayOffset: ev.dayOffset });
  const required = criterionForMarathonEventType(ev.type);
  const tariffOk = required == null || criteria.has(required);
  return dateOk && tariffOk;
};

/** Соседи по расписанию марафона: порядок как в сайдбаре (день → position). */
export const computeMarathonEventDayStepper = (
  events: MarathonNavEventLite[],
  product: { startDate: Date | null },
  criteria: Set<ProductCriterion>,
  currentEventId: string
): {
  dayLabel: string;
  prevId: string | null;
  hasPreviousEvent: boolean;
  nextId: string | null;
  hasNextEvent: boolean;
} => {
  const sorted = [...events].sort(
    (a, b) => a.dayOffset - b.dayOffset || a.position - b.position
  );
  const idx = sorted.findIndex((e) => e.id === currentEventId);
  if (idx < 0) {
    return {
      dayLabel: "",
      prevId: null,
      hasPreviousEvent: false,
      nextId: null,
      hasNextEvent: false,
    };
  }
  const cur = sorted[idx]!;
  const dayLabel = cur.dayOffset === 0 ? "День 0" : `День ${cur.dayOffset}`;
  const prev = idx > 0 ? sorted[idx - 1]! : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1]! : null;

  return {
    dayLabel,
    prevId: prev && isEventNavigable(prev, product, criteria) ? prev.id : null,
    hasPreviousEvent: Boolean(prev),
    nextId: next && isEventNavigable(next, product, criteria) ? next.id : null,
    hasNextEvent: Boolean(next),
  };
};
