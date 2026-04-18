import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enrollmentHasCriterion, loadEnrollmentForCriteria } from "@/lib/enrollment-criteria";
import { FeedbackLive } from "./feedback-live";

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
          <CardTitle className="text-base">Сообщения с куратором</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackLive
            enrollmentId={enrollment.id}
            studentUserId={session.user.id}
            initialMessages={messages}
          />
        </CardContent>
      </Card>
    </div>
  );
}
