export type CourseNavLesson = {
  slug: string;
  title: string;
  index: number;
  accessible: boolean;
  completed: boolean;
};

export type CourseNavProcedure = {
  id: string;
  title: string;
  completed: boolean;
  scheduledAt: string | null;
  notes: string | null;
};

export type CourseNavMarathonEvent = {
  id: string;
  title: string;
  accessible: boolean;
  /** Событие по дате доступно, но тип события не входит в тариф (LIVE / тренировка / питание). */
  lockedByTariff: boolean;
  completed: boolean;
  type: string;
};

export type CourseNavMarathonDay = {
  dayOffset: number;
  dayLabel: string;
  events: CourseNavMarathonEvent[];
};

export type CourseNavMarathonWeek = {
  weekNumber: number;
  weekLabel: string;
  days: CourseNavMarathonDay[];
};

export type CourseNavPayload = {
  courseSlug: string;
  title: string;
  productType: "COURSE" | "MARATHON";
  /** Отдельный канал обратной связи по тарифу. */
  curatorFeedback: boolean;
  /** Правила курса/марафона в markdown. Если задано — показывать раздел «Правила» в сайдбаре. */
  rules?: string | null;
  /**
   * Доступ к марафону истёк: startDate + durationDays + 30 дней прошло.
   * Layout редиректит студента на /catalog.
   */
  accessExpired?: boolean;
  lessons?: CourseNavLesson[];
  procedures?: CourseNavProcedure[];
  marathonWeeks?: CourseNavMarathonWeek[];
};
