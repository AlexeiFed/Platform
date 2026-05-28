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

/** Сдвиг: Prisma @updatedAt при отметке «прочитано» поднимает updatedAt — не считаем это новой активностью. */
const READ_MARK_SKEW_MS = 3000;

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
  const readAt = row.staffReadAt;

  if (row.status === "PENDING" || row.status === "IN_REVIEW") {
    if (readAt === null) return true;
    if (row.updatedAt.getTime() - readAt.getTime() > READ_MARK_SKEW_MS) return true;
  }

  if (lastMsg?.user.role === "USER" && (readAt === null || lastMsg.createdAt > readAt)) {
    return true;
  }

  return false;
}

export function isStudentHomeworkUnread(row: HomeworkUnreadRow): boolean {
  const lastMsg = row.messages[0];
  const readAt = row.studentReadAt;

  if (
    lastMsg &&
    lastMsg.user.role !== "USER" &&
    (readAt === null || lastMsg.createdAt > readAt)
  ) {
    return true;
  }

  if (row.status === "APPROVED" || row.status === "REJECTED") {
    if (readAt === null) return true;
    if (row.updatedAt.getTime() - readAt.getTime() > READ_MARK_SKEW_MS) return true;
  }

  return false;
}

export function countStaffHomeworkUnread(rows: HomeworkUnreadRow[]): number {
  return latestHomeworkSubmissionsByLessonUser(rows).filter(isStaffHomeworkUnread).length;
}

export function countStudentHomeworkUnread(rows: HomeworkUnreadRow[]): number {
  return latestHomeworkSubmissionsByLessonUser(rows).filter(isStudentHomeworkUnread).length;
}
