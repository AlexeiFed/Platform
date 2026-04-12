import type { MarathonEventType, ProductCriterion } from "@prisma/client";

/** Полный набор критериев (новый продукт / миграция). */
export const ALL_PRODUCT_CRITERIA: ProductCriterion[] = [
  "NUTRITION_CONTENT",
  "ONLINE_TRAINING",
  "TASKS",
  "COMMUNITY_CHAT",
  "HOMEWORK_REVIEW",
  "CURATOR_FEEDBACK",
  "MARATHON_LIVE",
];

export const PRODUCT_CRITERION_LABELS: Record<ProductCriterion, string> = {
  NUTRITION_CONTENT: "Материалы по питанию (события типа «Питание»)",
  ONLINE_TRAINING: "Онлайн-тренировки (события «Тренировка»)",
  TASKS: "Задания / домашние работы",
  COMMUNITY_CHAT: "Чат в ветке домашки (сообщения ученика)",
  HOMEWORK_REVIEW: "Проверка заданий куратором/админом",
  CURATOR_FEEDBACK: "Обратная связь (отдельный канал)",
  MARATHON_LIVE: "Эфиры (события LIVE)",
};

export const criterionForMarathonEventType = (
  type: MarathonEventType
): ProductCriterion | null => {
  if (type === "LIVE") return "MARATHON_LIVE";
  if (type === "TRAINING") return "ONLINE_TRAINING";
  if (type === "NUTRITION") return "NUTRITION_CONTENT";
  return null;
};

export const isSubsetOfEnabled = (
  tariffCriteria: ProductCriterion[],
  enabled: ProductCriterion[]
): boolean => {
  if (enabled.length === 0) return true;
  const allow = new Set(enabled);
  return tariffCriteria.every((c) => allow.has(c));
};
