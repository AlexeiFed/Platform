"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

export type MarathonLessonOption = {
  id: string;
  order: number;
  title: string;
};

function sortIdsByLessonOrder(ids: string[], lessons: MarathonLessonOption[]): string[] {
  const orderMap = new Map(lessons.map((l) => [l.id, l.order] as const));
  return [...ids].sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
}

/** Как в редакторе уроков: номер = позиция в программе (1…n), а не сырое поле `order` из БД (может «дырявым» быть). */
function useSortedLessonsWithDisplayPosition(lessons: MarathonLessonOption[]) {
  return useMemo(() => {
    const sorted = [...lessons].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const positionById = new Map<string, number>();
    sorted.forEach((l, i) => positionById.set(l.id, i + 1));
    return { sortedLessons: sorted, positionById };
  }, [lessons]);
}

function selectedLabel(count: number): string {
  if (count === 0) return "Выберите уроки…";
  const n = count % 100;
  const n10 = count % 10;
  if (n >= 11 && n <= 14) return `Выбрано уроков: ${count}`;
  if (n10 === 1) return `Выбран ${count} урок`;
  if (n10 >= 2 && n10 <= 4) return `Выбрано ${count} урока`;
  return `Выбрано уроков: ${count}`;
}

type Props = {
  lessons: MarathonLessonOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function MarathonEventLessonPicker({ lessons, selectedIds, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;

    const viewport = window.visualViewport;
    const handleViewportMove = () => setOpen(false);
    window.addEventListener("scroll", handleViewportMove, { passive: true });
    viewport?.addEventListener("scroll", handleViewportMove);

    return () => {
      window.removeEventListener("scroll", handleViewportMove);
      viewport?.removeEventListener("scroll", handleViewportMove);
    };
  }, [open]);

  const { sortedLessons, positionById } = useSortedLessonsWithDisplayPosition(lessons);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedLessons;
    return sortedLessons.filter((l) => {
      const pos = positionById.get(l.id) ?? 0;
      const posStr = String(pos);
      return (
        l.title.toLowerCase().includes(q) ||
        posStr.includes(q) ||
        `${pos}. ${l.title}`.toLowerCase().includes(q) ||
        String(l.order).includes(q)
      );
    });
  }, [sortedLessons, positionById, query]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(sortIdsByLessonOrder(next, lessons));
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <label className={tokens.typography.label}>Уроки (материалы события)</label>
      <Popover
        modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || lessons.length === 0}
            className="h-11 w-full justify-between font-normal"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label="Открыть список уроков для привязки к событию"
          >
            <span className={cn("truncate text-left", selectedIds.length === 0 && "text-muted-foreground")}>
              {lessons.length === 0 ? "Нет уроков в программе" : selectedLabel(selectedIds.length)}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию или номеру…"
                className="h-9 pl-8"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
            ) : (
              filtered.map((lesson) => {
                const checked = selectedIds.includes(lesson.id);
                const displayPos = positionById.get(lesson.id) ?? 0;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(lesson.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      checked && "bg-muted/60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input",
                        checked && "border-primary bg-primary text-primary-foreground"
                      )}
                      aria-hidden
                    >
                      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{displayPos}.</span> {lesson.title}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={clearAll}
              >
                Снять выбор
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        Номера 1…n — как в списке уроков выше (позиция в программе), а не «сырой» order из БД.
      </p>
    </div>
  );
}
