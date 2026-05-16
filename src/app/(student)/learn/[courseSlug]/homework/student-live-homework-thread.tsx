"use client";

import { useCallback, useEffect, useState } from "react";
import { StudentReviewThread } from "./student-review-thread";
import { getHomeworkThread } from "../[lessonSlug]/actions";

type ViewerUser = {
  name: string | null;
  email: string;
  role: string;
};

type Props = {
  lessonId: string;
  userId: string;
  viewerUser: ViewerUser;
  initialSubmission: {
    id: string;
    status: string;
    content: string | null;
    fileUrl: string | null;
    fileUrls: string[];
    createdAt: string;
    updatedAt: string;
    user: ViewerUser;
  };
  initialMessages: {
    id: string;
    content: string;
    createdAt: string;
    fileUrl: string | null;
    fileUrls: string[];
    replyToId: string | null;
    user: {
      name: string | null;
      email: string;
      role?: string | null;
    };
  }[];
};

export const StudentLiveHomeworkThread = ({
  lessonId,
  userId,
  viewerUser,
  initialSubmission,
  initialMessages,
}: Props) => {
  const [submission, setSubmission] = useState(initialSubmission);
  const [messages, setMessages] = useState(initialMessages);

  const apply = useCallback(async () => {
    const result = await getHomeworkThread(lessonId);
    if (!result || !("success" in result) || !result.success || !result.data) return;

    setSubmission({
      id: result.data.id,
      status: result.data.status,
      content: result.data.content,
      fileUrl: result.data.fileUrl,
      fileUrls: result.data.fileUrls,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
      user: viewerUser,
    });
    setMessages(result.data.messages);
  }, [lessonId, viewerUser]);

  useEffect(() => {
    setSubmission({ ...initialSubmission, user: viewerUser });
    setMessages(initialMessages);
  }, [initialSubmission, initialMessages, viewerUser]);

  useEffect(() => {
    let alive = true;

    const es = new EventSource(
      `/api/realtime/homework?lessonId=${encodeURIComponent(lessonId)}&userId=${encodeURIComponent(userId)}`
    );

    es.onmessage = () => {
      void (async () => {
        if (!alive) return;
        await apply();
      })();
    };

    return () => {
      alive = false;
      es.close();
    };
  }, [lessonId, userId, apply]);

  return (
    <StudentReviewThread
      submission={submission}
      messages={messages}
      onThreadChanged={apply}
    />
  );
};
