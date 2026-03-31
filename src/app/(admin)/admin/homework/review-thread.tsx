"use client";

import { useMemo, useState } from "react";
import { Check, CornerUpLeft, SendHorizonal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HomeworkMessages } from "@/components/shared/homework-messages";
import {
  buildHomeworkMessages,
  formatHomeworkDateTime,
  parseHomeworkContent,
  type HomeworkThreadMessage,
  type HomeworkThreadSubmission,
} from "@/lib/homework";
import { reviewHomework, sendChatMessage } from "./actions";

type Props = {
  submission: HomeworkThreadSubmission & { status: string };
  messages: HomeworkThreadMessage[];
  onThreadChanged?: () => Promise<void> | void;
};

const getReplyPreview = (content: string) => {
  const parsed = parseHomeworkContent(content);
  if (parsed.type === "qa") {
    return parsed.data
      .map((item) => `${item.question}: ${item.answer}`)
      .join("\n")
      .trim();
  }

  return parsed.data;
};

export function ReviewThread({ submission, messages, onThreadChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const availableMessages = useMemo(
    () => buildHomeworkMessages(submission, messages),
    [messages, submission]
  );

  const replyTarget = availableMessages.find((item) => item.id === replyToId) ?? null;

  const fallbackReplyToId = useMemo(() => {
    const studentMessages = messages.filter((item) => item.user.role === "USER");
    return studentMessages.at(-1)?.id ?? null;
  }, [messages]);

  async function handleReview(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    const result = await reviewHomework(submission.id, status);
    if (result.success && onThreadChanged) {
      await onThreadChanged();
    }
    setLoading(false);
  }

  async function handleSend() {
    const text = message.trim();
    if (!text || loading) return;

    setLoading(true);
    setError("");
    const result = await sendChatMessage(submission.id, text, replyToId ?? fallbackReplyToId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setMessage("");
    setReplyToId(null);
    if (onThreadChanged) {
      await onThreadChanged();
    }
    setLoading(false);
  }

  if (submission.status === "APPROVED") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success">Принято</Badge>
          <div className="text-sm text-muted-foreground">
            Последняя сдача: {formatHomeworkDateTime(submission.updatedAt)}
          </div>
        </div>
        <HomeworkMessages submission={submission} messages={messages} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={submission.status === "REJECTED" ? "destructive" : submission.status === "PENDING" ? "warning" : "secondary"}>
          {submission.status === "REJECTED" ? "Доработать" : submission.status === "PENDING" ? "Ожидает" : "На проверке"}
        </Badge>
        <div className="text-sm text-muted-foreground">
          Последняя сдача: {formatHomeworkDateTime(submission.updatedAt)}
        </div>
      </div>

      <HomeworkMessages
        submission={submission}
        messages={messages}
        activeReplyToId={replyToId}
        onReply={setReplyToId}
      />

      {replyTarget && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <CornerUpLeft className="h-4 w-4" />
              Ответ на сообщение
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReplyToId(null)}>
              Сбросить
            </Button>
          </div>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {getReplyPreview(replyTarget.content)}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleReview("APPROVED")}
            disabled={loading}
            className="text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950"
            aria-label="Принять"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleReview("REJECTED")}
            disabled={loading}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            aria-label="Отправить на доработку"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ответ студенту..."
            className="flex min-h-[96px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="shrink-0 self-end"
          >
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
