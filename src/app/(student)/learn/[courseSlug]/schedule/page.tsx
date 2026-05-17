/**
 * schedule/page.tsx
 * Недельные расписания марафона для студента: цель, недели, результат.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarRange } from "lucide-react";
import {
  buildMarathonScheduleNavSections,
  marathonWeekCountFromDuration,
  parseMarathonScheduleSections,
} from "@/lib/marathon-schedule-sections";
import { MarathonScheduleSectionsView } from "./marathon-schedule-sections-view";
import type { MarathonScheduleSections } from "@/types/marathon-schedule";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ section?: string }>;
};

export default async function MarathonSchedulePage({ params, searchParams }: Props) {
  const { courseSlug } = await params;
  const { section } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: {
      id: true,
      title: true,
      type: true,
      durationDays: true,
      marathonScheduleSections: true,
    },
  });

  if (!product || product.type !== "MARATHON") notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_productId: { userId: session.user.id, productId: product.id },
    },
    select: { id: true },
  });

  if (!enrollment) redirect("/catalog");

  const weekCount = marathonWeekCountFromDuration(product.durationDays);
  const sections = parseMarathonScheduleSections(
    product.marathonScheduleSections as MarathonScheduleSections | null,
    weekCount
  );
  const navSections = buildMarathonScheduleNavSections(sections, weekCount);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору курса">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К обзору
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          Расписание
        </div>
        <h1 className={`${tokens.typography.h2} text-balance`}>{product.title}</h1>
      </header>

      <MarathonScheduleSectionsView
        sections={navSections}
        initialOpenSection={section ?? "goal"}
        courseSlug={courseSlug}
      />
    </div>
  );
}
