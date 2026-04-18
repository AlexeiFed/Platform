/**
 * feedback-chat.tsx
 * Клиентский компонент мессенджера обратной связи для админа/куратора.
 * Левая колонка: список тредов со студентами.
 * Правая колонка: чат с polling каждые 3 секунды.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Loader2, MessageSquare, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import {
  getAdminFeedbackThreads,
  getThreadMessages,
  pollThreadMessages,
  sendAdminFeedbackMessage,
  markThreadRead,
} from "./actions";

// === Types ===

type Thread = {
  enrollmentId: string;
  user: { id: string; name: string | null; email: string };
  product: { id: string; title: string };
  lastMessage: { content: string; createdAt: string; fromStudent: boolean } | null;
  unreadCount: number;
};

type Message = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  senderName: string;
  fromStudent: boolean;
};

type Props = {
  initialThreads: Thread[];
  initialEnrollmentId?: string;
};

// === Helpers ===

function sortThreads(list: Thread[]): Thread[] {
  return [...list].sort((a, b) => {
    // Непрочитанные — выше
    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
    // Затем по дате последнего сообщения (новее = выше)
    const aDate = a.lastMessage?.createdAt ?? "";
    const bDate = b.lastMessage?.createdAt ?? "";
    return bDate.localeCompare(aDate);
  });
}

// === Component ===

export function FeedbackChat({ initialThreads, initialEnrollmentId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(
    initialEnrollmentId ?? initialThreads[0]?.enrollmentId ?? null
  );
  // Мобильный view: "threads" — список контактов, "chat" — открытый чат
  const [mobileView, setMobileView] = useState<"threads" | "chat">(
    initialEnrollmentId ? "chat" : "threads"
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageTimeRef = useRef<string>(new Date(0).toISOString());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Загрузка сообщений при смене треда
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      setLoadingMessages(true);
      setMessages([]);
      setError("");
      const result = await getThreadMessages(activeId);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else if (result.success && result.data) {
        setMessages(result.data.messages);
        const last = result.data.messages.at(-1);
        lastMessageTimeRef.current = last?.createdAt ?? new Date(0).toISOString();
      }
      setLoadingMessages(false);
      // Помечаем прочитанным
      void markThreadRead(activeId).then(() => {
        setThreads((prev) =>
          prev.map((t) => (t.enrollmentId === activeId ? { ...t, unreadCount: 0 } : t))
        );
      });
    })();

    return () => { cancelled = true; };
  }, [activeId]);

  // Скролл к последнему сообщению
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Polling: новые сообщения в активном треде (каждые 3с)
  useEffect(() => {
    if (!activeId) return;

    function startPoll() {
      pollRef.current = setInterval(async () => {
        const result = await pollThreadMessages(activeId!, lastMessageTimeRef.current);
        if (!result.success || !result.data || result.data.length === 0) return;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = result.data!.filter((m) => !existingIds.has(m.id));
          if (fresh.length === 0) return prev;
          lastMessageTimeRef.current = fresh.at(-1)!.createdAt;
          return [...prev, ...fresh];
        });
        // Если новые сообщения от студента — помечаем прочитанными
        void markThreadRead(activeId!);
      }, 3000);
    }

    startPoll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeId]);

  // Polling: обновление списка тредов (каждые 5с)
  useEffect(() => {
    threadPollRef.current = setInterval(async () => {
      const result = await getAdminFeedbackThreads();
      if (result.success && result.data) {
        // Сервер уже сортирует; дополнительно применяем клиентскую сортировку
        setThreads(sortThreads(
          result.data.map((t) => ({
            ...t,
            // Активный трек уже прочитан — сбрасываем счётчик
            unreadCount: t.enrollmentId === activeId ? 0 : t.unreadCount,
          }))
        ));
      }
    }, 5000);
    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [activeId]);

  // Смена треда
  function openThread(enrollmentId: string) {
    setActiveId(enrollmentId);
    setMobileView("chat"); // на мобиле переключаемся в вид чата
    const params = new URLSearchParams(searchParams.toString());
    params.set("enrollment", enrollmentId);
    router.replace(`/admin/feedback?${params.toString()}`, { scroll: false });
  }

  // Отправка сообщения
  async function handleSend() {
    const content = text.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    setError("");
    const result = await sendAdminFeedbackMessage({ enrollmentId: activeId, content });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.success && result.data) {
      setText("");
      setMessages((prev) => [...prev, result.data!]);
      lastMessageTimeRef.current = result.data.createdAt;
      // Обновляем превью треда
      // Обновляем превью треда и поднимаем его наверх
    setThreads((prev) =>
        sortThreads(
          prev.map((t) =>
            t.enrollmentId === activeId
              ? {
                  ...t,
                  lastMessage: {
                    content: result.data!.content,
                    createdAt: result.data!.createdAt,
                    fromStudent: false,
                  },
                }
              : t
          )
        )
      );
    }
  }

  const activeThread = threads.find((t) => t.enrollmentId === activeId);

  return (
    <div className="flex h-[calc(100svh-theme(spacing.52))] md:h-[calc(100vh-theme(spacing.32))] min-h-96 overflow-hidden rounded-xl border">
      {/* === Левая колонка: список тредов === */}
      {/* На мобиле: видна только если mobileView === "threads" */}
      <div
        className={`flex-col border-r md:flex md:w-72 md:shrink-0 ${
          mobileView === "threads" ? "flex w-full" : "hidden"
        }`}
      >
        <div className="shrink-0 border-b px-4 py-3">
          <p className="text-sm font-semibold">Чаты</p>
          <p className="text-xs text-muted-foreground">{threads.length} студентов</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-sm">Нет сообщений</p>
            </div>
          ) : (
            threads.map((t) => {
              const isActive = t.enrollmentId === activeId;
              return (
                <button
                  key={t.enrollmentId}
                  type="button"
                  onClick={() => openThread(t.enrollmentId)}
                  className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                    isActive ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {t.user.name ?? t.user.email}
                    </span>
                    {t.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{t.product.title}</p>
                  {t.lastMessage && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {t.lastMessage.fromStudent ? "" : "Вы: "}
                      {t.lastMessage.content}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* === Правая колонка: чат === */}
      {/* На мобиле: видна только если mobileView === "chat" */}
      <div
        className={`flex-col md:flex md:min-w-0 md:flex-1 ${
          mobileView === "chat" ? "flex min-w-0 flex-1" : "hidden"
        }`}
      >
        {/* Header чата */}
        {activeThread ? (
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            {/* Кнопка назад — только мобиле */}
            <button
              type="button"
              onClick={() => setMobileView("threads")}
              className="md:hidden -ml-1 rounded-full p-1 hover:bg-accent"
              aria-label="Назад к контактам"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {activeThread.user.name ?? activeThread.user.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">{activeThread.product.title}</p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b px-4 py-3">
            <p className="text-sm text-muted-foreground">Выберите студента слева</p>
          </div>
        )}

        {/* Сообщения */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingMessages ? (
            <div className="flex justify-center pt-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 && activeId ? (
            <p className="text-center text-sm text-muted-foreground pt-8">
              Нет сообщений — напишите студенту
            </p>
          ) : !activeId ? (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
              <p className={tokens.typography.small}>Выберите студента из списка слева</p>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.fromStudent ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.fromStudent
                    ? "rounded-tl-sm bg-muted"
                    : "rounded-tr-sm bg-primary text-primary-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div
                  className={`mt-1 text-[10px] ${
                    m.fromStudent ? "text-muted-foreground" : "text-primary-foreground/70"
                  }`}
                >
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(m.createdAt))}
                  {!m.fromStudent && m.readAt && " · прочитано"}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Поле ввода */}
        {activeId && (
          <div className="shrink-0 border-t px-4 py-3">
            {error && (
              <p className="mb-2 text-xs text-destructive">{error}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Введите сообщение… (Enter — отправить, Shift+Enter — новая строка)"
                rows={2}
                className="min-h-[60px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void handleSend()}
                disabled={sending || !text.trim()}
                className="h-10 w-10 shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
