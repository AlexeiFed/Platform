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
  lessons?: CourseNavLesson[];
  procedures?: CourseNavProcedure[];
  marathonWeeks?: CourseNavMarathonWeek[];
};
