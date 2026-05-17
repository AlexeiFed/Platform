"use client";

import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { scrollToMarathonDay } from "./marathon-events-scroll";

type MarathonEventsDayNavProps = {
  days: number[];
};

export function MarathonEventsDayNav({ days }: MarathonEventsDayNavProps) {
  if (days.length === 0) return null;

  return (
    <nav
      className="flex flex-wrap gap-1.5 pt-2"
      aria-label="Переход к дню марафона"
    >
      {days.map((day) => (
        <button
          key={day}
          type="button"
          onClick={() => scrollToMarathonDay(day)}
          className={cn(
            tokens.radius.full,
            "shrink-0 border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground",
            tokens.animation.fast,
            "hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
          )}
        >
          День {day}
        </button>
      ))}
    </nav>
  );
}
