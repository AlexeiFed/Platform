import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enrollmentHasCriterion, loadEnrollmentForCriteria } from "@/lib/enrollment-criteria";
import { FeedbackForm } from "./feedback-form";

type Props = { params: Promise<{ courseSlug: string }> };

export default async function CuratorFeedbackPage({ params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true, title: true },
  });
  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    select: { id: true },
  });
  if (!enrollment) redirect("/catalog");

  const crit = await loadEnrollmentForCriteria(enrollment.id);
  if (!crit || !enrollmentHasCriterion(crit, "CURATOR_FEEDBACK")) {
    notFound();
  }

  const messages = await prisma.curatorFeedbackMessage.findMany({
    where: { enrollmentId: enrollment.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true, role: true } } },
    take: 200,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Обратная связь</h1>
        <p className={`${tokens.typography.body} mt-2`}>{product.title}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сообщения</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет сообщений — напишите первым.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    {(m.user.name ?? m.user.email) + " · " + new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(m.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </li>
              ))}
            </ul>
          )}
          <FeedbackForm enrollmentId={enrollment.id} />
        </CardContent>
      </Card>
    </div>
  );
}
