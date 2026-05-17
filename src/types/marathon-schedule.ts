/**
 * marathon-schedule.ts
 * Контент недельных расписаний марафона (цель, недели, результат).
 * Блоки — подмножество лендинга: heading, text, features.
 */

import type { LandingBlock } from "@/types/landing";

export type ScheduleContentBlock =
  | Extract<LandingBlock, { type: "heading" }>
  | Extract<LandingBlock, { type: "text" }>
  | Extract<LandingBlock, { type: "features" }>;

export type MarathonScheduleSectionId = "goal" | `week-${number}` | "result";

export type MarathonScheduleSections = {
  goal: ScheduleContentBlock[];
  weeks: Record<string, ScheduleContentBlock[]>;
  result: ScheduleContentBlock[];
};

export type MarathonScheduleNavSection = {
  id: MarathonScheduleSectionId;
  label: string;
  blocks: ScheduleContentBlock[];
};
