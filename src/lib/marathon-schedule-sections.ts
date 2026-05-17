import type {
  MarathonScheduleNavSection,
  MarathonScheduleSectionId,
  MarathonScheduleSections,
  ScheduleContentBlock,
} from "@/types/marathon-schedule";

export function marathonWeekCountFromDuration(durationDays: number | null | undefined): number {
  if (!durationDays || durationDays < 1) return 6;
  return Math.max(1, Math.ceil(durationDays / 7));
}

export function emptyMarathonScheduleSections(weekCount: number): MarathonScheduleSections {
  const weeks: Record<string, ScheduleContentBlock[]> = {};
  for (let w = 1; w <= weekCount; w++) {
    weeks[String(w)] = [];
  }
  return { goal: [], weeks, result: [] };
}

export function parseMarathonScheduleSections(
  raw: unknown,
  weekCount: number
): MarathonScheduleSections {
  const empty = emptyMarathonScheduleSections(weekCount);
  if (!raw || typeof raw !== "object") return empty;

  const data = raw as Partial<MarathonScheduleSections>;
  const goal = Array.isArray(data.goal) ? data.goal : [];
  const result = Array.isArray(data.result) ? data.result : [];
  const weeks: Record<string, ScheduleContentBlock[]> = { ...empty.weeks };

  if (data.weeks && typeof data.weeks === "object") {
    for (let w = 1; w <= weekCount; w++) {
      const key = String(w);
      const blocks = (data.weeks as Record<string, unknown>)[key];
      weeks[key] = Array.isArray(blocks) ? (blocks as ScheduleContentBlock[]) : [];
    }
  }

  return { goal, weeks, result };
}

export function marathonScheduleSectionLabel(id: MarathonScheduleSectionId): string {
  if (id === "goal") return "Цель марафона";
  if (id === "result") return "Результат марафона";
  const match = /^week-(\d+)$/.exec(id);
  if (match) return `Неделя ${match[1]}`;
  return id;
}

export function buildMarathonScheduleNavSections(
  sections: MarathonScheduleSections,
  weekCount: number
): MarathonScheduleNavSection[] {
  const items: MarathonScheduleNavSection[] = [
    { id: "goal", label: marathonScheduleSectionLabel("goal"), blocks: sections.goal },
  ];
  for (let w = 1; w <= weekCount; w++) {
    const id = `week-${w}` as MarathonScheduleSectionId;
    items.push({
      id,
      label: marathonScheduleSectionLabel(id),
      blocks: sections.weeks[String(w)] ?? [],
    });
  }
  items.push({
    id: "result",
    label: marathonScheduleSectionLabel("result"),
    blocks: sections.result,
  });
  return items;
}

export function marathonScheduleHasContent(sections: MarathonScheduleSections): boolean {
  if (sections.goal.length > 0 || sections.result.length > 0) return true;
  return Object.values(sections.weeks).some((blocks) => blocks.length > 0);
}
