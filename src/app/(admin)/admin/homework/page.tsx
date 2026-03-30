import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import { formatDate } from "@/lib/utils";
import { HomeworkActions } from "./homework-actions";
import { BookOpen, GraduationCap } from "lucide-react";

type QA = { question: string; answer: string };

function parseHomeworkContent(content: string | null): { type: "qa"; data: QA[] } | { type: "text"; data: string } {
  if (!content) return { type: "text", data: "" };
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && "question" in parsed[0]) {
      return { type: "qa", data: parsed as QA[] };
    }
  } catch {
    /* not JSON */
  }
  return { type: "text", data: content };
}

export default async function AdminHomeworkPage() {
  const submissions = await prisma.homeworkSubmission.findMany({
    include: {
      user: { select: { name: true, email: true } },
      lesson: {
        select: {
          title: true,
          product: { select: { id: true, title: true, type: true } },
        },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const statusLabels: Record<string, string> = {
    PENDING: "Ожидает",
    IN_REVIEW: "На проверке",
    APPROVED: "Принято",
    REJECTED: "Отклонено",
  };

  const statusVariants: Record<string, "warning" | "secondary" | "success" | "destructive"> = {
    PENDING: "warning",
    IN_REVIEW: "secondary",
    APPROVED: "success",
    REJECTED: "destructive",
  };

  const grouped = new Map<string, { title: string; type: string; items: typeof submissions }>();
  for (const sub of submissions) {
    const pid = sub.lesson.product.id;
    if (!grouped.has(pid)) {
      grouped.set(pid, {
        title: sub.lesson.product.title,
        type: sub.lesson.product.type,
        items: [],
      });
    }
    grouped.get(pid)!.items.push(sub);
  }

  return (
    <div className="space-y-8">
      <h1 className={tokens.typography.h2}>Домашние задания</h1>

      {grouped.size === 0 && (
        <div className="text-center py-12">
          <p className={tokens.typography.body}>Нет домашних заданий</p>
        </div>
      )}

      {[...grouped.entries()].map(([productId, group]) => (
        <section key={productId} className="space-y-3">
          <div className="flex items-center gap-2">
            {group.type === "COURSE" ? (
              <BookOpen className="h-5 w-5 text-primary" />
            ) : (
              <GraduationCap className="h-5 w-5 text-purple-500" />
            )}
            <h2 className={tokens.typography.h4}>{group.title}</h2>
            <Badge variant={group.type === "COURSE" ? "default" : "secondary"} className="text-xs">
              {group.type === "COURSE" ? "Курс" : "Марафон"}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">{group.items.length} заданий</span>
          </div>

          <div className="space-y-2 pl-2 border-l-2 border-muted">
            {group.items.map((sub) => {
              const parsed = parseHomeworkContent(sub.content);
              return (
                <Card key={sub.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={statusVariants[sub.status]}>
                            {statusLabels[sub.status]}
                          </Badge>
                          {sub._count.messages > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {sub._count.messages} сообщ.
                            </Badge>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium">
                            {sub.user.name ?? sub.user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sub.lesson.title} • {formatDate(sub.createdAt)}
                          </p>
                        </div>

                        {/* Content */}
                        {parsed.type === "qa" ? (
                          <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                            {parsed.data.map((qa, i) => (
                              <div key={i} className="space-y-0.5">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {qa.question}
                                </p>
                                <p className="text-sm">{qa.answer || "—"}</p>
                              </div>
                            ))}
                          </div>
                        ) : parsed.data ? (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {parsed.data}
                          </p>
                        ) : null}

                        {/* Attached photo */}
                        {sub.fileUrl && (
                          <a
                            href={sub.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={sub.fileUrl}
                              alt="Прикреплённое фото"
                              className="max-h-48 rounded-lg border object-cover hover:opacity-90 transition-opacity"
                            />
                          </a>
                        )}
                      </div>

                      <HomeworkActions submissionId={sub.id} currentStatus={sub.status} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
