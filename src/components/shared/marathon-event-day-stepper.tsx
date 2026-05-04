import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";

export type MarathonEventDayStepperProps = {
  courseSlug: string;
  dayLabel: string;
  prevId: string | null;
  hasPreviousEvent: boolean;
  nextId: string | null;
  hasNextEvent: boolean;
  variant: "top" | "bottom";
};

const eventHref = (courseSlug: string, id: string) => `/learn/${courseSlug}/event/${id}`;

export const MarathonEventDayStepper = ({
  courseSlug,
  dayLabel,
  prevId,
  hasPreviousEvent,
  nextId,
  hasNextEvent,
  variant,
}: MarathonEventDayStepperProps) => {
  if (!dayLabel) return null;

  const prevDisabled = !hasPreviousEvent || !prevId;
  const nextDisabled = !hasNextEvent || !nextId;
  const prevHint = !hasPreviousEvent
    ? "Предыдущего дня нет"
    : !prevId
      ? "Предыдущее событие ещё недоступно"
      : "Предыдущий день";
  const nextHint = !hasNextEvent
    ? "Следующего дня нет"
    : !nextId
      ? "Следующее событие ещё не открыто или недоступно по тарифу"
      : "Следующий день";

  const edge = variant === "top" ? "border-b border-border pb-4 mb-1" : "border-t border-border pt-4 mt-1";

  return (
    <nav
      className={cn("flex items-center justify-between gap-3", edge, tokens.animation.fast)}
      aria-label="Переход между днями марафона"
    >
      {prevDisabled ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled
          title={prevHint}
          aria-label={prevHint}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Button>
      ) : (
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" asChild>
          <Link href={eventHref(courseSlug, prevId!)} title={prevHint} aria-label={prevHint}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
      )}

      <p className={cn("min-w-0 flex-1 truncate text-center", tokens.typography.h4)}>
        {dayLabel}
      </p>

      {nextDisabled ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled
          title={nextHint}
          aria-label={nextHint}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Button>
      ) : (
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" asChild>
          <Link href={eventHref(courseSlug, nextId!)} title={nextHint} aria-label={nextHint}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
      )}
    </nav>
  );
};
