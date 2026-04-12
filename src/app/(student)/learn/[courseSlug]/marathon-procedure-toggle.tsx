"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { toggleMarathonProcedureCompletion } from "./procedure-actions";

type Props = {
  procedureId: string;
  completed: boolean;
  /** Узкая строка в сайдбаре — без длинного текста */
  compact?: boolean;
};

export function MarathonProcedureToggle({ procedureId, completed, compact }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      setError("");
      const result = await toggleMarathonProcedureCompletion(procedureId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col items-stretch gap-1">
        <Button
          type="button"
          variant={completed ? "outline" : "default"}
          size="sm"
          className="h-8 text-xs"
          onClick={handleClick}
          disabled={isPending}
        >
          {isPending ? "…" : completed ? "Снять" : "Готово"}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className={`${tokens.typography.small} max-w-md`}>
        {completed
          ? "Если визит перенесён или отменён, можно снять отметку."
          : "После визита в клинику отметьте процедуру — так обновится прогресс марафона."}
      </p>
      <Button type="button" variant={completed ? "outline" : "default"} size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Сохраняем..." : completed ? "Снять отметку" : "Отметить пройденной"}
      </Button>
      {error ? <p className="text-sm text-destructive sm:w-full">{error}</p> : null}
    </div>
  );
}
