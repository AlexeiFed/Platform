import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CourseNavSync } from "@/components/shared/course-nav-context";
import { getCourseNavPayload } from "./course-nav-data";

type Props = {
  children: React.ReactNode;
  params: Promise<{ courseSlug: string }>;
};

export default async function LearnCourseLayout({ children, params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const payload = await getCourseNavPayload(courseSlug, session.user.id);

  // Марафон закрыт через 30 дней после окончания
  if (payload?.accessExpired) redirect("/catalog");

  return (
    <>
      {payload ? <CourseNavSync payload={payload} /> : null}
      {children}
    </>
  );
}
