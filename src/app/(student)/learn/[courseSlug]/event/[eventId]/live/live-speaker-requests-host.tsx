"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveSpeaker, listSpeakerRequests } from "./actions";

type RequestRow = { userId: string; requestedAt: string; name: string | null; email: string };

export function LiveSpeakerRequestsHost({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{
    maxSpeakers: number;
    speakerCount: number;
    requests: RequestRow[];
  } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setError("");
    const res = await listSpeakerRequests(eventId);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    if (res && "success" in res && res.success) {
      setData({
        maxSpeakers: res.data.maxSpeakers,
        speakerCount: res.data.speakerCount,
        requests: [...res.data.requests],
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [eventId]);

  const approve = (userId: string) => {
    startTransition(async () => {
      setError("");
      const res = await approveSpeaker(eventId, userId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="text-sm font-medium">
        Запросы в спикеры ({data?.speakerCount ?? 0}/{data?.maxSpeakers ?? 6})
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {data?.requests?.length ? (
        <div className="space-y-2">
          {data.requests.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {r.name ? `${r.name} · ` : ""}
                  {r.email}
                </div>
                <div className="text-xs text-muted-foreground">Запрос: {new Date(r.requestedAt).toLocaleString("ru-RU")}</div>
              </div>
              <Button type="button" size="sm" onClick={() => approve(r.userId)} disabled={isPending}>
                Допустить
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Запросов нет.</div>
      )}
    </div>
  );
}

