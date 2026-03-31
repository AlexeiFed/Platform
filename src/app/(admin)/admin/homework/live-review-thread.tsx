"use client";

import { useEffect, useState } from "react";
import { ReviewThread } from "./review-thread";
import { getHomeworkReviewThread } from "./actions";

type Props = {
  productId: string;
  userId: string;
  lessonId: string;
  initialSubmission: {
    id: string;
    status: string;
    content: string | null;
    fileUrl: string | null;
    fileUrls: string[];
    createdAt: string;
    updatedAt: string;
    user: {
      name: string | null;
      email: string;
      role: "USER";
    };
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

export function LiveReviewThread({
  productId,
  userId,
  lessonId,
  initialSubmission,
  initialMessages,
}: Props) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [messages, setMessages] = useState(initialMessages);

  async function apply() {
    const result = await getHomeworkReviewThread({ productId, userId, lessonId });
    if (!result.success || !result.data) {
      return;
    }

    setSubmission({
      id: result.data.id,
      status: result.data.status,
      content: result.data.content,
      fileUrl: result.data.fileUrl,
      fileUrls: result.data.fileUrls,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
      user: result.data.user,
    });
    setMessages(result.data.messages);
  }

  useEffect(() => {
    setSubmission(initialSubmission);
    setMessages(initialMessages);
  }, [initialSubmission, initialMessages]);

  useEffect(() => {
    let alive = true;

    const eventSource = new EventSource(
      `/api/realtime/homework?lessonId=${encodeURIComponent(lessonId)}&userId=${encodeURIComponent(userId)}`
    );

    eventSource.onmessage = () => {
      void (async () => {
        if (!alive) return;
        await apply();
      })();
    };

    eventSource.onerror = () => {
      // browser retries automatically
    };

    return () => {
      alive = false;
      eventSource.close();
    };
  }, [lessonId, productId, userId]);

  return <ReviewThread submission={submission} messages={messages} onThreadChanged={apply} />;
}
