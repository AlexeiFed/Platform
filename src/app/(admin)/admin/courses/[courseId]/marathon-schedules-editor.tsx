/**
 * marathon-schedules-editor.tsx
 * Редактор недельных расписаний марафона: цель, недели, результат.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScheduleContentBlocksEditor } from "@/components/shared/schedule-content-blocks-editor";
import { tokens } from "@/lib/design-tokens";
import {
  buildMarathonScheduleNavSections,
  marathonWeekCountFromDuration,
  parseMarathonScheduleSections,
} from "@/lib/marathon-schedule-sections";
import { cn } from "@/lib/utils";
import { CalendarRange, ChevronRight, Loader2, Save } from "lucide-react";
import { updateProductMarathonSchedules } from "../actions";
import type { MarathonScheduleSections, ScheduleContentBlock } from "@/types/marathon-schedule";

type Props = {
  productId: string;
  durationDays: number | null;
  initialSections: MarathonScheduleSections | null;
};

export function MarathonSchedulesEditor({ productId, durationDays, initialSections }: Props) {
  const weekCount = marathonWeekCountFromDuration(durationDays);
  const [sections, setSections] = useState<MarathonScheduleSections>(() =>
    parseMarathonScheduleSections(initialSections, weekCount)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState<string>("goal");

  const navSections = useMemo(() => buildMarathonScheduleNavSections(sections, weekCount), [sections, weekCount]);

  useEffect(() => {
    setSections(parseMarathonScheduleSections(initialSections, weekCount));
  }, [initialSections, weekCount]);

  function patchSection(
    sectionId: string,
    blocks: ScheduleContentBlock[]
  ) {
    if (sectionId === "goal") {
      setSections((prev) => ({ ...prev, goal: blocks }));
      return;
    }
    if (sectionId === "result") {
      setSections((prev) => ({ ...prev, result: blocks }));
      return;
    }
    const weekMatch = /^week-(\d+)$/.exec(sectionId);
    if (weekMatch) {
      const key = weekMatch[1];
      setSections((prev) => ({
        ...prev,
        weeks: { ...prev.weeks, [key]: blocks },
      }));
    }
  }

  function blocksForSection(sectionId: string): ScheduleContentBlock[] {
    if (sectionId === "goal") return sections.goal;
    if (sectionId === "result") return sections.result;
    const weekMatch = /^week-(\d+)$/.exec(sectionId);
    if (weekMatch) return sections.weeks[weekMatch[1]] ?? [];
    return [];
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await updateProductMarathonSchedules(productId, sections);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <CardTitle className="text-base leading-snug">Расписания марафона</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && (
            <Badge variant="success" className="text-xs">
              Сохранено
            </Badge>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {saving ? "Сохранение..." : "Сохранить расписания"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <p className={tokens.typography.small}>
          Заполните цель, расписание по неделям ({weekCount} нед.) и итог марафона. Студенты увидят раздел «Расписание» в
          меню курса.
        </p>

        <div className="space-y-2">
          {navSections.map((section) => {
            const sectionKey = section.id;
            const isOpen = openSection === sectionKey;
            const blockCount = section.blocks.length;
            return (
              <details
                key={sectionKey}
                className="group overflow-hidden rounded-xl border bg-card"
                open={isOpen}
                onToggle={(e) => {
                  if (e.currentTarget.open) setOpenSection(sectionKey);
                }}
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
                  {blockCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">{blockCount} блок.</span>
                  )}
                </summary>
                <div className="border-t px-4 py-4">
                  <ScheduleContentBlocksEditor
                    blocks={blocksForSection(sectionKey)}
                    onChange={(blocks) => patchSection(sectionKey, blocks)}
                    compact
                  />
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
