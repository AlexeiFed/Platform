import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { Users, BookOpen, ClipboardCheck, TrendingUp, MessageSquare, ArrowRight } from "lucide-react";

export default async function AdminDashboardPage() {
  const [usersCount, productsCount, pendingHomework, enrollmentsCount, unreadFeedback] =
    await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.homeworkSubmission.count({ where: { status: "PENDING" } }),
      prisma.enrollment.count(),
      prisma.curatorFeedbackMessage.count({
        where: { readAt: null, user: { role: "USER" } },
      }),
    ]);

  const stats = [
    {
      label: "Пользователей",
      value: usersCount,
      icon: Users,
      color: "text-blue-500",
      href: "/admin/users",
    },
    {
      label: "Курсов",
      value: productsCount,
      icon: BookOpen,
      color: "text-green-500",
      href: "/admin/courses",
    },
    {
      label: "На проверке",
      value: pendingHomework,
      icon: ClipboardCheck,
      color: "text-orange-500",
      href: "/admin/homework",
    },
    {
      label: "Зачислений",
      value: enrollmentsCount,
      icon: TrendingUp,
      color: "text-primary",
      href: "/admin/payments",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className={tokens.typography.h2}>Панель управления</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={cn(
              tokens.animation.normal,
              "block min-h-[44px] rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={`${stat.label}: перейти в раздел`}
          >
            <Card className="h-full transition-colors hover:border-primary/30 hover:bg-accent/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Обратная связь */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Обратная связь</CardTitle>
            {unreadFeedback > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                {unreadFeedback} новых
              </span>
            )}
          </div>
          <Link
            href="/admin/feedback"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Открыть чат <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {unreadFeedback > 0 ? (
            <p className={tokens.typography.body}>
              У вас <strong>{unreadFeedback}</strong> непрочитанных{" "}
              {unreadFeedback === 1 ? "сообщение" : unreadFeedback < 5 ? "сообщения" : "сообщений"} от студентов.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Нет новых сообщений.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
