"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markHomeworkCompleted } from "./actions";

export function MarkHomeworkCompleted({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handle = () => {
    startTransition(async () => {
      setError("");
      const result = await markHomeworkCompleted(lessonId);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handle} disabled={isPending}>
        {isPending ? "Сохраняем..." : "Отметить выполненным"}
      </Button>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  );
}

