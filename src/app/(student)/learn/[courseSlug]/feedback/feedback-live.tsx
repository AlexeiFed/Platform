/**
 * feedback-live.tsx
 * Клиентский компонент чата обратной связи студента с polling каждые 5 сек.
 * Поддерживает текст + вложения (изображения / видео / файлы).
 * Дубликаты устранены: после отправки используем реальное сообщение с сервера
 * и сразу сдвигаем lastTimeRef, чтобы polling не добавил его повторно.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { pollStudentFeedbackMessages, submitCuratorFeedbackMessage } from "./actions";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AttachButton,
  AttachmentsPreview,
  AttachmentsView,
  parseAttachments,
  useFeedbackUploader,
  type FeedbackAttachment,
} from "@/components/shared/feedback-attachments";

type RawMessage = {
  id: string;
  userId: string;
  content: string;
  attachments?: unknown;
  createdAt: Date | string;
  user: { name: string | null; email: string; role: string };
};

type Props = {
  enrollmentId: string;
  studentUserId: string;
  initialMessages: RawMessage[];
};

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });

export function FeedbackLive({ enrollmentId, studentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<RawMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<FeedbackAttachment[]>([]);
  const { uploading, uploadFiles } = useFeedbackUploader("feedback");

  const lastTimeRef = useRef<string>(
    (() => {
      const last = initialMessages.at(-1)?.createdAt;
      if (!last) return new Date(0).toISOString();
      return typeof last === "string" ? last : last.toISOString();
    })()
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Polling новых сообщений (от куратора)
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await pollStudentFeedbackMessages(enrollmentId, lastTimeRef.current);
      if (!result.success || !result.data || result.data.length === 0) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = result.data!.filter((m) => !existingIds.has(m.id));
        if (fresh.length === 0) return prev;
        const lastCreated = fresh.at(-1)!.createdAt;
        lastTimeRef.current =
          typeof lastCreated === "string" ? lastCreated : lastCreated.toISOString();
        return [...prev, ...fresh];
      });
    }, 5000);
    return () => clearInterval(id);
  }, [enrollmentId]);

  async function handleFiles(files: File[]) {
    const uploaded = await uploadFiles(files);
    if (uploaded.length) setPending((prev) => [...prev, ...uploaded].slice(0, 10));
  }

  async function handleSend() {
    const content = text.trim();
    if ((!content && pending.length === 0) || sending) return;
    setSending(true);
    setError("");
    const result = await submitCuratorFeedbackMessage({
      enrollmentId,
      content,
      attachments: pending,
    });
    setSending(false);
    if (result.error || !result.success || !result.data) {
      setError(result.error ?? "Ошибка отправки");
      return;
    }
    setText("");
    setPending([]);
    const real = result.data;
    setMessages((prev) => {
      if (prev.some((m) => m.id === real.id)) return prev;
      return [...prev, real];
    });
    const createdAt = real.createdAt;
    lastTimeRef.current =
      typeof createdAt === "string" ? createdAt : new Date(createdAt).toISOString();
  }

  return (
    <div className="space-y-4">
      {/* Лента сообщений */}
      <div className="flex max-h-[60vh] min-h-40 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground pt-4">
            Пока нет сообщений — напишите первым.
          </p>
        ) : (
          messages.map((m) => {
            const fromStudent = m.userId === studentUserId;
            const atts = parseAttachments(m.attachments);
            return (
              <div
                key={m.id}
                className={`flex ${fromStudent ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    fromStudent
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-muted"
                  }`}
                >
                  {!fromStudent && (
                    <p className="mb-0.5 text-[11px] font-medium opacity-70">
                      {m.user.name ?? "Куратор"}
                    </p>
                  )}
                  {m.content && (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  )}
                  {atts.length > 0 && <AttachmentsView items={atts} />}
                  <div
                    className={`mt-1 text-[10px] ${
                      fromStudent ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {fmt.format(new Date(m.createdAt))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Поле ввода */}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AttachmentsPreview
        items={pending}
        onRemove={(i) => setPending((prev) => prev.filter((_, idx) => idx !== i))}
      />
      <div className="flex items-end gap-2">
        <AttachButton uploading={uploading} onFiles={handleFiles} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Введите сообщение… (Enter — отправить)"
          rows={2}
          className="min-h-[60px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          size="icon"
          onClick={() => void handleSend()}
          disabled={sending || uploading || (!text.trim() && pending.length === 0)}
          className="h-10 w-10 shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
