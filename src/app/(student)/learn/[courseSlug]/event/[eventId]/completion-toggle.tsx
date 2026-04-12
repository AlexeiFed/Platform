"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toggleMarathonEventCompletion } from "./actions";

type Props = {
  eventId: string;
  completed: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export const MarathonEventCompletionToggle = ({ eventId, completed, disabled, disabledReason }: Props) => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      setError("");
      const result = await toggleMarathonEventCompletion(eventId);

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleToggle} disabled={isPending || disabled}>
        {isPending ? "Сохраняем..." : completed ? "Снять отметку выполнения" : "Отметить выполненным"}
      </Button>
      {disabled && disabledReason ? (
        <div className="text-sm text-muted-foreground">{disabledReason}</div>
      ) : null}
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
};
