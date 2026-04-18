/**
 * page.tsx — /admin/feedback
 * Серверная обёртка: загружает список тредов и рендерит клиентский чат.
 * URL-параметр ?enrollment=<id> открывает конкретный тред.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tokens } from "@/lib/design-tokens";
import { getAdminFeedbackThreads } from "./actions";
import { FeedbackChat } from "./feedback-chat";

type Props = { searchParams: Promise<{ enrollment?: string }> };

export default async function AdminFeedbackPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") redirect("/admin");

  const { enrollment: initialEnrollmentId } = await searchParams;

  const result = await getAdminFeedbackThreads();
  const threads = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-4">
      <h1 className={tokens.typography.h2}>Обратная связь</h1>
      <FeedbackChat
        initialThreads={threads}
        initialEnrollmentId={initialEnrollmentId}
      />
    </div>
  );
}
