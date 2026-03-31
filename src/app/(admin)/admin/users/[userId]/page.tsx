import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tokens } from "@/lib/design-tokens";
import { formatDate, getInitials, lessonsLabel } from "@/lib/utils";
import { formatHomeworkDateTime } from "@/lib/homework";

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
              _count: { select: { lessons: true } },
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
    },
  });

  if (!user) {
    notFound();
  }

  const roleLabel =
    user.role === "ADMIN" ? "Админ" : user.role === "CURATOR" ? "Куратор" : "Студент";

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
            <div className="mt-1 text-sm text-muted-foreground">
              Зарегистрирован: {formatDate(user.createdAt)}
            </div>
          </div>
        </CardContent>
      </Card>

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
            {user.enrollments.map((enrollment) => (
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
                      {lessonsLabel(enrollment.product._count.lessons)} · прогресс {Math.round(enrollment.progress * 100)}%
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Выдан: {formatDate(enrollment.createdAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
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
