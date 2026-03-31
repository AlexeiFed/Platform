"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { HomeworkMessages } from "@/components/shared/homework-messages";
import { formatHomeworkDateTime, type HomeworkThreadMessage, type HomeworkThreadSubmission } from "@/lib/homework";
import { HomeworkForm } from "./homework-form";
import { getHomeworkThread } from "./actions";

export function HomeworkThread({
  lessonId,
  questions,
  submission,
  messages,
}: {
  lessonId: string;
  questions?: string[];
  submission: HomeworkThreadSubmission & { status: string };
  messages: HomeworkThreadMessage[];
}) {
  const [live, setLive] = useState<{ submission: typeof submission; messages: HomeworkThreadMessage[] } | null>(null);
  const sub = live?.submission ?? submission;
  const msgs = useMemo(() => live?.messages ?? messages, [live?.messages, messages]);

  useEffect(() => {
    let alive = true;

    const apply = async () => {
      const res = await getHomeworkThread(lessonId);
      if (!alive) return;
      if (res && "success" in res && res.success) {
        if (!res.data) return;
        setLive({
          submission: {
            id: res.data.id,
            status: res.data.status,
            fileUrl: res.data.fileUrl,
            fileUrls: res.data.fileUrls,
            content: res.data.content,
            createdAt: res.data.createdAt,
            updatedAt: res.data.updatedAt,
            user: submission.user,
          },
          messages: res.data.messages,
        });
      }
    };

    apply();

    // Realtime via SSE only; avoid extra polling and full-page refreshes.
    const es = new EventSource(`/api/realtime/homework?lessonId=${encodeURIComponent(lessonId)}`);
    es.onmessage = () => apply();
    es.onerror = () => {
      // keep quiet; browser retries
    };

    return () => {
      alive = false;
      es.close();
    };
  }, [lessonId]);

  const statusLabel = useMemo(() => {
    if (sub.status === "PENDING") return "На проверке";
    if (sub.status === "IN_REVIEW") return "Проверяется";
    if (sub.status === "APPROVED") return "Принято";
    if (sub.status === "REJECTED") return "Доработать";
    return sub.status;
  }, [sub.status]);

  const statusVariant = useMemo(() => {
    if (sub.status === "APPROVED") return "success";
    if (sub.status === "REJECTED") return "destructive";
    if (sub.status === "PENDING") return "warning";
    return "secondary";
  }, [sub.status]) as "success" | "destructive" | "warning" | "secondary";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant}>{statusLabel}</Badge>
        <div className="text-sm text-muted-foreground">
          Последняя сдача: {formatHomeworkDateTime(sub.updatedAt)}
        </div>
      </div>

      {(msgs.length > 0 || sub.fileUrls.length > 0 || sub.fileUrl || sub.content) && (
        <HomeworkMessages submission={sub} messages={msgs} />
      )}

      {sub.status === "REJECTED" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Куратор попросил доработку. Исправь и отправь заново — статус снова станет “На проверке”.
          </p>
          <HomeworkForm lessonId={lessonId} questions={questions} />
        </div>
      )}
    </div>
  );
}

