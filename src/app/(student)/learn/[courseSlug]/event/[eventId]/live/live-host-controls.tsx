"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { endLiveRoom, startLiveRoom } from "./actions";

export function LiveHostControls({ eventId, status }: { eventId: string; status: "SCHEDULED" | "LIVE" | "ENDED" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

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
        <Button type="button" onClick={start} disabled={isPending || status === "LIVE"}>
          {isPending ? "..." : "Начать эфир"}
        </Button>
        <Button type="button" variant="outline" onClick={end} disabled={isPending || status !== "LIVE"}>
          {isPending ? "..." : "Завершить эфир"}
        </Button>
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  );
}

