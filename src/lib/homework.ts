export type HomeworkQuestionAnswer = {
  question: string;
  answer: string;
};

export type HomeworkThreadUser = {
  name: string | null;
  email: string;
  role?: string | null;
};

export type HomeworkThreadMessage = {
  id: string;
  content: string;
  createdAt: string;
  fileUrl: string | null;
  fileUrls: string[];
  replyToId: string | null;
  user: HomeworkThreadUser;
  isSynthetic?: boolean;
};

export type HomeworkThreadSubmission = {
  id: string;
  content: string | null;
  fileUrl: string | null;
  fileUrls: string[];
  createdAt: string;
  updatedAt: string;
  user: HomeworkThreadUser;
};

export type HomeworkConversationItem = HomeworkThreadMessage & {
  depth: number;
  replyTo?: {
    id: string;
    authorLabel: string;
    content: string;
  };
};

export function parseHomeworkContent(
  content: string | null
): { type: "qa"; data: HomeworkQuestionAnswer[] } | { type: "text"; data: string } {
  if (!content) {
    return { type: "text", data: "" };
  }

  try {
    const parsed = JSON.parse(content);

    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === "object" &&
      parsed[0] &&
      "question" in parsed[0]
    ) {
      return { type: "qa", data: parsed as HomeworkQuestionAnswer[] };
    }
  } catch {
    /* not JSON */
  }

  return { type: "text", data: content };
}

export function filterDuplicatedStudentHomeworkMessages<
  T extends { content: string; user: { role?: string | null } }
>(messages: T[], submissionContent: string | null) {
  const normalizedSubmissionContent = submissionContent?.trim();

  if (!normalizedSubmissionContent) {
    return messages;
  }

  return messages.filter((message) => {
    return !(
      message.user.role === "USER" &&
      message.content.trim() === normalizedSubmissionContent
    );
  });
}

const getAuthorLabel = (user: HomeworkThreadUser) => {
  if (user.role === "ADMIN") return "Админ";
  if (user.role === "CURATOR") return "Куратор";
  if (user.role === "USER") return "Ученик";
  return user.name ?? user.email;
};

const truncateReplyPreview = (content: string) => {
  const parsed = parseHomeworkContent(content);
  const text =
    parsed.type === "qa"
      ? parsed.data.map((item) => item.answer).filter(Boolean).join(" ")
      : parsed.data;

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
};

export function buildHomeworkMessages(
  submission: HomeworkThreadSubmission,
  messages: HomeworkThreadMessage[]
) {
  const submissionFiles = submission.fileUrls.length > 0
    ? submission.fileUrls
    : submission.fileUrl
      ? [submission.fileUrl]
      : [];

  const hasCurrentStudentRoot = messages.some((message) => {
    const messageFiles = message.fileUrls.length > 0
      ? message.fileUrls
      : message.fileUrl
        ? [message.fileUrl]
        : [];

    return (
      message.user.role === "USER" &&
      message.replyToId == null &&
      message.content.trim() === (submission.content ?? "").trim() &&
      JSON.stringify(messageFiles) === JSON.stringify(submissionFiles)
    );
  });

  if (!submission.content && submissionFiles.length === 0) {
    return messages;
  }

  if (hasCurrentStudentRoot) {
    return messages;
  }

  return [
    {
      id: `submission-${submission.id}`,
      content: submission.content ?? "",
      createdAt: submission.updatedAt,
      fileUrl: submission.fileUrl,
      fileUrls: submissionFiles,
      replyToId: null,
      user: submission.user,
      isSynthetic: true,
    },
    ...messages,
  ];
}

export function buildHomeworkConversation(
  submission: HomeworkThreadSubmission,
  messages: HomeworkThreadMessage[],
  sortOrder: "asc" | "desc"
): HomeworkConversationItem[] {
  const normalizedMessages = buildHomeworkMessages(submission, messages);
  const messageMap = new Map(normalizedMessages.map((message) => [message.id, message]));

  /** Хронологическая лента: ответы подвешены к «родителю» в дереве и оказывались между несвязанными корнями. */
  const sorted = [...normalizedMessages].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) {
      return sortOrder === "asc" ? ta - tb : tb - ta;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted.map((message) => {
    const replyTarget = message.replyToId ? messageMap.get(message.replyToId) : null;
    return {
      ...message,
      depth: 0,
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            authorLabel: getAuthorLabel(replyTarget.user),
            content: truncateReplyPreview(replyTarget.content),
          }
        : undefined,
    };
  });
}

export function formatHomeworkDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
