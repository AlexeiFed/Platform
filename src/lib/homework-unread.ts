import type { HomeworkStatus, Role } from "@prisma/client";

type LastMessage = {
  createdAt: Date;
  user: { role: Role };
};

export type HomeworkUnreadRow = {
  status: HomeworkStatus;
  updatedAt: Date;
  staffReadAt: Date | null;
  studentReadAt: Date | null;
  lessonId: string;
  userId: string;
  messages: LastMessage[];
};

/** Последняя отправка на пару урок+студент (список уже отсортирован по updatedAt desc). */
export function latestHomeworkSubmissionsByLessonUser<T extends HomeworkUnreadRow>(
  rows: T[]
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.lessonId}:${row.userId}`;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

export function isStaffHomeworkUnread(row: HomeworkUnreadRow): boolean {
  const lastMsg = row.messages[0];
  const readAt = row.staffReadAt ?? new Date(0);

  if (
    (row.status === "PENDING" || row.status === "IN_REVIEW") &&
    row.updatedAt > readAt
  ) {
    return true;
  }

  if (lastMsg?.user.role === "USER" && lastMsg.createdAt > readAt) {
    return true;
  }

  return false;
}

export function isStudentHomeworkUnread(row: HomeworkUnreadRow): boolean {
  const lastMsg = row.messages[0];
  const readAt = row.studentReadAt ?? new Date(0);

  if (
    lastMsg &&
    lastMsg.user.role !== "USER" &&
    lastMsg.createdAt > readAt
  ) {
    return true;
  }

  if (
    (row.status === "APPROVED" || row.status === "REJECTED") &&
    row.updatedAt > readAt
  ) {
    return true;
  }

  return false;
}

export function countStaffHomeworkUnread(rows: HomeworkUnreadRow[]): number {
  return latestHomeworkSubmissionsByLessonUser(rows).filter(isStaffHomeworkUnread).length;
}

export function countStudentHomeworkUnread(rows: HomeworkUnreadRow[]): number {
  return latestHomeworkSubmissionsByLessonUser(rows).filter(isStudentHomeworkUnread).length;
}
