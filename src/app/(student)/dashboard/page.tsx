import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import { BookOpen, Clock } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: session.user.id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          coverUrl: true,
          _count: { select: { lessons: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Моё обучение</h1>
        <p className={tokens.typography.body}>Добро пожаловать, {session.user.name}!</p>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className={tokens.typography.h4}>Пока нет курсов</h3>
            <p className={tokens.typography.small}>
              Перейдите в{" "}
              <Link href="/catalog" className="text-primary hover:underline">каталог</Link>
              {" "}чтобы начать обучение
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((enrollment) => (
            <Link key={enrollment.id} href={`/learn/${enrollment.product.slug}`}>
              <Card className={`${tokens.shadow.card} h-full`}>
                {enrollment.product.coverUrl && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                    <img
                      src={enrollment.product.coverUrl}
                      alt={enrollment.product.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={enrollment.product.type === "COURSE" ? "default" : "secondary"}>
                      {enrollment.product.type === "COURSE" ? "Курс" : "Марафон"}
                    </Badge>
                    {enrollment.expiresAt && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        до {new Date(enrollment.expiresAt).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg">{enrollment.product.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Прогресс</span>
                      <span className="font-medium">{Math.round(enrollment.progress * 100)}%</span>
                    </div>
                    <Progress value={enrollment.progress * 100} />
                    <p className="text-xs text-muted-foreground">
                      {enrollment.product._count.lessons} уроков
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
