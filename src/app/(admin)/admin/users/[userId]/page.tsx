import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tokens } from "@/lib/design-tokens";
import { calculateMarathonProgress } from "@/lib/marathon-progress";
import { formatDate, getInitials, lessonsLabel } from "@/lib/utils";
import { formatHomeworkDateTime } from "@/lib/homework";
import { measurementFields } from "@/lib/measurement-fields";
import { MarathonProceduresManager } from "./marathon-procedures-manager";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function AdminUserDetailsPage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      enrollments: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              published: true,
              startDate: true,
              durationDays: true,
              marathonEvents: {
                where: { published: true },
                select: {
                  id: true,
                  eventLessons: {
                    select: {
                      lesson: {
                        select: {
                          submissions: {
                            where: { userId },
                            select: { status: true },
                            take: 1,
                          },
                        },
                      },
                    },
                  },
                },
              },
              _count: { select: { lessons: true } },
            },
          },
          procedures: {
            include: {
              procedureType: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
          eventCompletions: {
            select: {
              id: true,
              eventId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      curatedProducts: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              type: true,
              _count: { select: { lessons: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      submissions: {
        take: 10,
        orderBy: { updatedAt: "desc" },
        include: {
          lesson: {
            select: {
              title: true,
              product: {
                select: {
                  title: true,
                  type: true,
                },
              },
            },
          },
        },
      },
      progressPhotos: {
        orderBy: [{ type: "asc" }, { position: "asc" }],
      },
      measurements: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const roleLabel =
    user.role === "ADMIN" ? "Админ" : user.role === "CURATOR" ? "Куратор" : "Студент";
  const procedureTypes = await prisma.procedureType.findMany({
    orderBy: { title: "asc" },
  });
  const marathonEnrollments = user.enrollments
    .filter((enrollment) => enrollment.product.type === "MARATHON")
    .map((enrollment) => ({
      id: enrollment.id,
      createdAt: enrollment.createdAt.toISOString(),
      product: {
        id: enrollment.product.id,
        title: enrollment.product.title,
        slug: enrollment.product.slug,
        published: enrollment.product.published,
        startDate: enrollment.product.startDate?.toISOString() ?? null,
        durationDays: enrollment.product.durationDays ?? null,
      },
      procedures: enrollment.procedures.map((procedure) => ({
        id: procedure.id,
        scheduledAt: procedure.scheduledAt?.toISOString() ?? null,
        completedAt: procedure.completedAt?.toISOString() ?? null,
        notes: procedure.notes ?? null,
        position: procedure.position,
        procedureType: {
          id: procedure.procedureType.id,
          title: procedure.procedureType.title,
        },
      })),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className={tokens.typography.h2}>Пользователь</h1>
          <p className={tokens.typography.body}>Карточка пользователя и его доступы</p>
        </div>
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          Назад к списку
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatarUrl ?? undefined} />
            <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold">{user.name ?? "Без имени"}</div>
              <Badge>{roleLabel}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Зарегистрирован: {formatDate(user.createdAt)}</span>
              <span>Вес: {user.weight != null ? `${user.weight} кг` : "—"}</span>
              <span>Рост: {user.height != null ? `${user.height} см` : "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {user.progressPhotos.length > 0 && (
        <section className="space-y-3">
          <h2 className={tokens.typography.h4}>Фото прогресса</h2>
          <Card>
            <CardContent className="space-y-5 p-6">
              {(["BEFORE", "AFTER"] as const).map((type) => {
                const rowPhotos = user.progressPhotos.filter((p) => p.type === type);
                if (rowPhotos.length === 0) return null;
                return (
                  <div key={type} className="space-y-2">
                    <p className={tokens.typography.label}>{type === "BEFORE" ? "До" : "После"}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, pos) => {
                        const p = rowPhotos.find((x) => x.position === pos);
                        return (
                          <div
                            key={`${type}-${pos}`}
                            className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                          >
                            {p ? (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute inset-0"
                              >
                                <Image
                                  src={p.url}
                                  alt={`${type === "BEFORE" ? "До" : "После"} ${pos + 1}`}
                                  fill
                                  sizes="(max-width: 640px) 50vw, 200px"
                                  className="object-cover"
                                  unoptimized
                                />
                              </a>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {user.measurements.length > 0 && (
        <section className="space-y-3">
          <h2 className={tokens.typography.h4}>Замеры</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 px-3 text-left font-medium whitespace-nowrap">Дата</th>
                      {measurementFields.map((f) => (
                        <th
                          key={f.key}
                          className="py-2 px-2 text-right font-medium whitespace-nowrap"
                        >
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {user.measurements.map((m) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="py-2 px-3 whitespace-nowrap font-medium">
                          {formatDate(m.date)}
                        </td>
                        {measurementFields.map((f) => (
                          <td
                            key={f.key}
                            className="py-2 px-2 text-right tabular-nums"
                          >
                            {m[f.key] == null ? "—" : m[f.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h2 className={tokens.typography.h4}>Приобретенные курсы / марафоны</h2>
        {user.enrollments.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              У пользователя пока нет приобретенных продуктов.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {user.enrollments.map((enrollment) => {
              const progressValue = enrollment.product.type === "MARATHON"
                ? calculateMarathonProgress({
                    events: enrollment.product.marathonEvents.map((event) => ({
                      id: event.id,
                      lessons: event.eventLessons.map((el) => el.lesson),
                      completions: enrollment.eventCompletions.filter((completion) => completion.eventId === event.id),
                    })),
                    procedures: enrollment.procedures,
                  }).value
                : enrollment.progress;

              return (
              <Card key={enrollment.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-medium">{enrollment.product.title}</div>
                      <Badge variant={enrollment.product.type === "COURSE" ? "default" : "secondary"}>
                        {enrollment.product.type === "COURSE" ? "Курс" : "Марафон"}
                      </Badge>
                      <Badge variant={enrollment.product.published ? "outline" : "secondary"}>
                        {enrollment.product.published ? "Опубликован" : "Черновик"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {lessonsLabel(enrollment.product._count.lessons)} · прогресс {Math.round(progressValue * 100)}%
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Выдан: {formatDate(enrollment.createdAt)}
                  </div>
                </CardContent>
              </Card>
            )})}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={tokens.typography.h4}>Последние сдачи ДЗ</h2>
        {user.submissions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Домашние задания пока не сдавались.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {user.submissions.map((submission) => (
              <Card key={submission.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-medium">{submission.lesson.title}</div>
                      <Badge variant={submission.lesson.product.type === "COURSE" ? "default" : "secondary"}>
                        {submission.lesson.product.title}
                      </Badge>
                      <Badge
                        variant={
                          submission.status === "APPROVED"
                            ? "success"
                            : submission.status === "REJECTED"
                              ? "destructive"
                              : submission.status === "PENDING"
                                ? "warning"
                                : "secondary"
                        }
                      >
                        {submission.status === "APPROVED"
                          ? "Принято"
                          : submission.status === "REJECTED"
                            ? "Доработать"
                            : submission.status === "PENDING"
                              ? "Ожидает"
                              : "На проверке"}
                      </Badge>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {submission.content || "Без текстового ответа"}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatHomeworkDateTime(submission.updatedAt.toISOString())}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {marathonEnrollments.length > 0 && (
        <section className="space-y-3">
          <h2 className={tokens.typography.h4}>Процедуры марафонов</h2>
          <MarathonProceduresManager
            userId={user.id}
            enrollments={marathonEnrollments}
            procedureTypes={procedureTypes.map((procedureType) => ({
              id: procedureType.id,
              title: procedureType.title,
            }))}
          />
        </section>
      )}

      {user.role === "CURATOR" && (
        <section className="space-y-3">
          <h2 className={tokens.typography.h4}>Назначенные куратору продукты</h2>
          {user.curatedProducts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Куратору пока ничего не назначено.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {user.curatedProducts.map((assignment) => (
                <Card key={assignment.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{assignment.product.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {assignment.product.type === "COURSE" ? "Курс" : "Марафон"} · {lessonsLabel(assignment.product._count.lessons)}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Назначен: {formatDate(assignment.createdAt)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
