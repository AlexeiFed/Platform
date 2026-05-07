"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestSpeaker } from "./actions";

export function LiveSpeakerRequest({
  eventId,
  alreadyRequested,
  approved,
}: {
  eventId: string;
  alreadyRequested: boolean;
  approved: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      setError("");
      const res = await requestSpeaker(eventId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (approved) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Вы допущены как спикер. Перезайдите в эфир, чтобы включить камеру.</div>
        <Button type="button" variant="outline" onClick={() => router.refresh()} disabled={isPending}>
          Обновить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={submit} disabled={isPending || alreadyRequested}>
        {isPending ? "..." : alreadyRequested ? "Запрос отправлен" : "Попросить слово (стать спикером)"}
      </Button>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  );
}

