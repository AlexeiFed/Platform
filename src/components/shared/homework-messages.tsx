"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  buildHomeworkConversation,
  formatHomeworkDateTime,
  parseHomeworkContent,
  type HomeworkThreadMessage,
  type HomeworkThreadSubmission,
} from "@/lib/homework";
import { cn } from "@/lib/utils";

const isVideoAttachmentUrl = (url: string) => {
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv|ogg)$/.test(normalized);
};

type Props = {
  submission: HomeworkThreadSubmission;
  messages: HomeworkThreadMessage[];
  onReply?: (messageId: string) => void;
  activeReplyToId?: string | null;
};

export function HomeworkMessages({
  submission,
  messages,
  onReply,
  activeReplyToId = null,
}: Props) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const conversation = useMemo(
    () => buildHomeworkConversation(submission, messages, sortOrder),
    [messages, sortOrder, submission]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Переписка</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
        >
          {sortOrder === "asc" ? "Старые сверху" : "Новые сверху"}
        </Button>
      </div>

      <div className="space-y-3">
        {conversation.map((message) => {
          const isStudent = message.user.role === "USER";
          const parsed = parseHomeworkContent(message.content);

          return (
            <article
              key={message.id}
              className={cn(
                "flex",
                isStudent ? "justify-end" : "justify-start"
              )}
              style={{ paddingLeft: `${Math.min(message.depth, 3) * 20}px` }}
            >
              <div
                className={cn(
                  "max-w-[90%] space-y-2 border px-4 py-3 shadow-sm",
                  isStudent
                    ? "rounded-[22px] rounded-br-md border-primary/20 bg-primary/10"
                    : "rounded-[22px] rounded-bl-md border-border/70 bg-card",
                  activeReplyToId === message.id && "ring-2 ring-primary/40"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium">
                    {message.user.role === "USER"
                      ? "Ученик"
                      : message.user.role === "ADMIN"
                        ? "Админ"
                        : message.user.role === "CURATOR"
                          ? "Куратор"
                          : message.user.name ?? message.user.email}
                    {" · "}
                    {message.user.name ?? message.user.email}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatHomeworkDateTime(message.createdAt)}
                  </div>
                </div>

                {message.replyTo && (
                  <div className="rounded-2xl border border-border/50 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                    <div className="mb-1 font-medium text-foreground/80">
                      Ответ на {message.replyTo.authorLabel}
                    </div>
                    <div className="whitespace-pre-wrap">{message.replyTo.content}</div>
                  </div>
                )}

                {parsed.type === "qa" ? (
                  <div className="space-y-2">
                    {parsed.data.map((qa, index) => (
                      <div key={`${message.id}-${index}`} className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">{qa.question}</div>
                        <div className="text-sm whitespace-pre-wrap">{qa.answer || "—"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{parsed.data}</div>
                )}

                {message.fileUrls.length > 0 && (
                  <div
                    className={cn(
                      "grid gap-2",
                      message.fileUrls.length === 1
                        ? "grid-cols-1"
                        : message.fileUrls.length === 2
                          ? "grid-cols-2"
                          : "grid-cols-2 md:grid-cols-3"
                    )}
                  >
                    {message.fileUrls.map((fileUrl, index) => (
                      <a key={`${message.id}-${index}`} href={fileUrl} target="_blank" rel="noopener noreferrer">
                        {isVideoAttachmentUrl(fileUrl) ? (
                          <video
                            src={fileUrl}
                            controls
                            preload="metadata"
                            className="h-40 w-full rounded-xl border bg-black object-cover"
                          />
                        ) : (
                          <Image
                            src={fileUrl}
                            alt={`Прикрепленное фото ${index + 1}`}
                            width={640}
                            height={320}
                            className="h-40 w-full rounded-xl border object-cover"
                            unoptimized
                          />
                        )}
                      </a>
                    ))}
                  </div>
                )}

                {onReply && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onReply(message.id)}
                    >
                      Ответить
                    </Button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
