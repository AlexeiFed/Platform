"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HomeworkForm } from "./homework-form";
import { getHomeworkThread } from "./actions";

type Msg = {
  id: string;
  content: string;
  createdAt: string;
  user: { name: string | null; email: string; role?: string };
};

type QA = { question: string; answer: string };

function parseHomeworkContent(content: string | null): { type: "qa"; data: QA[] } | { type: "text"; data: string } {
  if (!content) return { type: "text", data: "" };
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] && "question" in parsed[0]) {
      return { type: "qa", data: parsed as QA[] };
    }
  } catch {
    /* not JSON */
  }
  return { type: "text", data: content };
}

export function HomeworkThread({
  lessonId,
  questions,
  submission,
  messages,
}: {
  lessonId: string;
  questions?: string[];
  submission: { id: string; status: string; fileUrl: string | null; content: string | null };
  messages: Msg[];
}) {
  const [live, setLive] = useState<{ submission: typeof submission; messages: Msg[] } | null>(null);
  const sub = live?.submission ?? submission;
  const msgs = live?.messages ?? messages;

  useEffect(() => {
    let alive = true;

    const apply = async () => {
      const res = await getHomeworkThread(lessonId);
      if (!alive) return;
      if (res && "success" in res && res.success) {
        if (!res.data) return;
        setLive({
          submission: { id: res.data.id, status: res.data.status, fileUrl: res.data.fileUrl, content: res.data.content },
          messages: res.data.messages,
        });
      }
    };

    apply();

    // Realtime via SSE; fallback to slow polling if SSE is blocked.
    const es = new EventSource(`/api/realtime/homework?lessonId=${encodeURIComponent(lessonId)}`);
    es.onmessage = () => apply();
    es.onerror = () => {
      // keep quiet; browser retries
    };

    const t = setInterval(apply, 15000);
    return () => {
      alive = false;
      es.close();
      clearInterval(t);
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
      <Badge variant={statusVariant}>{statusLabel}</Badge>

      {(msgs.length > 0 || sub.fileUrl || sub.content) && (
        <div className="space-y-2">
          {sub.fileUrl && (
            <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img src={sub.fileUrl} alt="Фото" className="max-h-48 rounded-lg border object-cover" />
            </a>
          )}
          {/* latest answer preview (optional) */}
          {sub.content && (
            <Card className="p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">Последний ответ</div>
              {(() => {
                const parsed = parseHomeworkContent(sub.content);
                if (parsed.type === "qa") {
                  return (
                    <div className="space-y-2">
                      {parsed.data.map((qa, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="text-xs font-medium text-muted-foreground">{qa.question}</div>
                          <div className="text-sm whitespace-pre-wrap">{qa.answer || "—"}</div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return <div className="text-sm whitespace-pre-wrap">{parsed.data}</div>;
              })()}
            </Card>
          )}
          {msgs.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="text-xs text-muted-foreground mb-1">
                {m.user.name ?? m.user.email}
              </div>
              {(() => {
                const parsed = parseHomeworkContent(m.content);
                if (parsed.type === "qa") {
                  return (
                    <div className="space-y-2">
                      {parsed.data.map((qa, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="text-xs font-medium text-muted-foreground">{qa.question}</div>
                          <div className="text-sm whitespace-pre-wrap">{qa.answer || "—"}</div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return <div className="text-sm whitespace-pre-wrap">{parsed.data}</div>;
              })()}
            </Card>
          ))}
        </div>
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

