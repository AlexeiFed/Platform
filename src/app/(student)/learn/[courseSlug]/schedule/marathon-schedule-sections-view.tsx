/**
 * marathon-schedule-sections-view.tsx
 * Раскрывающиеся секции расписания марафона для студента.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandingRenderer } from "@/app/(student)/catalog/[productSlug]/landing-renderer";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { ChevronRight } from "lucide-react";
import type { MarathonScheduleNavSection } from "@/types/marathon-schedule";
import type { LandingBlock } from "@/types/landing";

type Props = {
  sections: MarathonScheduleNavSection[];
  initialOpenSection: string;
  courseSlug: string;
};

export function MarathonScheduleSectionsView({
  sections,
  initialOpenSection,
  courseSlug,
}: Props) {
  const router = useRouter();
  const [openSection, setOpenSection] = useState(initialOpenSection);

  useEffect(() => {
    setOpenSection(initialOpenSection);
  }, [initialOpenSection]);

  function handleToggle(sectionId: string, open: boolean) {
    if (open) {
      setOpenSection(sectionId);
      router.replace(`/learn/${courseSlug}/schedule?section=${encodeURIComponent(sectionId)}`, {
        scroll: false,
      });
    }
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = openSection === section.id;
        return (
          <details
            key={section.id}
            id={section.id}
            className="group scroll-mt-24 overflow-hidden rounded-xl border bg-card"
            open={isOpen}
            onToggle={(e) => handleToggle(section.id, e.currentTarget.open)}
          >
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium",
                "[&::-webkit-details-marker]:hidden"
              )}
            >
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="flex-1">{section.label}</span>
            </summary>
            <div className="space-y-6 border-t px-4 py-5">
              {section.blocks.length > 0 ? (
                <LandingRenderer blocks={section.blocks as LandingBlock[]} />
              ) : (
                <p className={cn(tokens.typography.small, "text-muted-foreground")}>
                  Содержимое появится позже.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
