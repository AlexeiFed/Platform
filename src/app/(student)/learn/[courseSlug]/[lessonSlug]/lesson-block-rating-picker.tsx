"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { saveLessonBlockRating } from "./lesson-block-rating-actions";

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

type Props = {
  lessonId: string;
  blockId: string;
  productId: string;
  courseSlug: string;
  lessonSlug: string;
  introText: string;
  initialRating: number | null;
};

const SCORES = Array.from({ length: 11 }, (_, i) => i);

export const LessonBlockRatingPicker = ({
  lessonId,
  blockId,
  productId,
  courseSlug,
  lessonSlug,
  introText,
  initialRating,
}: Props) => {
  const [value, setValue] = useState<number | null>(initialRating);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hint = useMemo(() => {
    if (value == null) return "Выберите число от 0 до 10";
    if (value <= 2) return "Легко";
    if (value >= 8) return value === 10 ? "Умер" : "Очень тяжело";
    return "Средняя нагрузка";
  }, [value]);

  const onPick = useCallback(
    (rating: number) => {
      setError(null);
      startTransition(async () => {
        const res = await saveLessonBlockRating({
          lessonId,
          blockId,
          productId,
          courseSlug,
          lessonSlug,
          rating,
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setValue(rating);
      });
    },
    [blockId, courseSlug, lessonId, lessonSlug, productId]
  );

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className={`flex items-center gap-2 text-base ${tokens.typography.label}`}>
          <Gauge className="h-4 w-4 text-primary" aria-hidden />
          Оценка нагрузки
        </CardTitle>
        {introText.trim() ? (
          HTML_TAG_RE.test(introText) ? (
            <div
              className={`${tokens.typography.prose} prose prose-neutral mt-2 max-w-none dark:prose-invert prose-p:my-1`}
              dangerouslySetInnerHTML={{ __html: introText }}
            />
          ) : (
            <p className={`${tokens.typography.small} mt-2 whitespace-pre-line text-foreground`}>{introText}</p>
          )
        ) : (
          <p className={`${tokens.typography.small} pt-1`}>
            <span className="text-foreground font-medium">0 — легко</span>,{" "}
            <span className="text-foreground font-medium">10 — умер</span>.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="flex flex-wrap gap-1.5 sm:gap-2"
          role="group"
          aria-label="Оценка нагрузки от 0 до 10"
        >
          {SCORES.map((n) => {
            const active = value === n;
            return (
              <button
                key={n}
                type="button"
                disabled={pending}
                onClick={() => onPick(n)}
                className={cn(
                  tokens.radius.md,
                  "min-h-10 min-w-10 px-2 text-sm font-medium tabular-nums transition-colors",
                  "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent"
                )}
                aria-pressed={active}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className={`${tokens.typography.small} flex flex-wrap items-center gap-2`}>
          <span className="text-muted-foreground">Подсказка:</span>
          <span className="font-medium text-foreground">{hint}</span>
          {value != null && !pending ? (
            <span className="text-muted-foreground">· Сохранено: {value}</span>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
};
