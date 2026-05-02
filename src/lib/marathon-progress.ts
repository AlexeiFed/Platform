type MarathonProgressEvent = {
  id: string;
  /** Все прикреплённые к событию уроки; достаточно сдать одно ДЗ — событие считается закрытым по ДЗ */
  lessons?: Array<{
    submissions?: Array<{ status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" }>;
  } | null>;
  completions?: Array<Record<string, unknown>>;
};

type MarathonProgressProcedure = {
  completedAt: Date | string | null;
};

type CalculateMarathonProgressInput = {
  events: MarathonProgressEvent[];
  procedures: MarathonProgressProcedure[];
};

type MarathonProgressResult = {
  value: number;
  completedEvents: number;
  totalEvents: number;
  completedProcedures: number;
  totalProcedures: number;
};

export const getStartOfDay = (value: Date | string) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const getMarathonEventDate = (startDate: Date | string, dayOffset: number) => {
  const result = getStartOfDay(startDate);
  result.setDate(result.getDate() + dayOffset);
  return result;
};

export const calculateMarathonProgress = ({
  events,
  procedures,
}: CalculateMarathonProgressInput): MarathonProgressResult => {
  const totalEvents = events.length;
  const totalProcedures = procedures.length;

  const completedEvents = events.filter((event) => {
    const manuallyCompleted = (event.completions?.length ?? 0) > 0;
    const approvedHomework =
      (event.lessons ?? []).some((lesson) =>
        lesson ? lesson.submissions?.some((submission) => submission.status === "APPROVED") : false
      ) ?? false;

    return manuallyCompleted || approvedHomework;
  }).length;

  const completedProcedures = procedures.filter((procedure) => Boolean(procedure.completedAt)).length;

  const eventRatio = totalEvents > 0 ? completedEvents / totalEvents : 0;
  const procedureRatio = totalProcedures > 0 ? completedProcedures / totalProcedures : 0;

  const eventWeight = totalEvents > 0 ? (totalProcedures > 0 ? 0.7 : 1) : 0;
  const procedureWeight = totalProcedures > 0 ? (totalEvents > 0 ? 0.3 : 1) : 0;

  const value = Math.min(1, eventRatio * eventWeight + procedureRatio * procedureWeight);

  return {
    value,
    completedEvents,
    totalEvents,
    completedProcedures,
    totalProcedures,
  };
};
