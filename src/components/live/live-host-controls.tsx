"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startLiveRoom, endLiveRoom } from "@/lib/live-room-actions";

export function LiveHostControls({
  eventId,
  status,
  joinDayAllowed = true,
}: {
  eventId: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  /** false — не день эфира по расписанию (кнопка «Начать» недоступна, пока эфир не запущен). */
  joinDayAllowed?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const startDisabled =
    !joinDayAllowed && status !== "LIVE";

  const start = () => {
    startTransition(async () => {
      setError("");
      const res = await startLiveRoom(eventId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const end = () => {
    startTransition(async () => {
      setError("");
      const res = await endLiveRoom(eventId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={start}
          disabled={isPending || status === "LIVE" || status === "ENDED" || startDisabled}
        >
          {isPending ? "..." : "Начать эфир"}
        </Button>
        <Button type="button" variant="outline" onClick={end} disabled={isPending || status !== "LIVE"}>
          {isPending ? "..." : "Завершить эфир"}
        </Button>
      </div>
      {startDisabled ? (
        <div className="text-xs text-muted-foreground">Старт доступен только в день трансляции по расписанию.</div>
      ) : null}
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  );
}
