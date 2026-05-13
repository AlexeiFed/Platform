import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMarathonEventDate } from "@/lib/marathon-progress";
import {
  isMarathonLiveJoinAllowedToday,
  marathonDateKeyInZone,
  marathonLiveJoinDeniedMessage,
} from "@/lib/marathon-live-broadcast";
import { getResolvedMarathonTimeZone } from "@/lib/marathon-time-zone";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ productId?: string; date?: string }>;
};

const marathonTz = getResolvedMarathonTimeZone();

function formatRuDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: marathonTz,
  }).format(d);
}

function formatRuTime(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: marathonTz,
  }).format(d);
}

export default async function AdminLivePage({ searchParams }: Props) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    redirect("/login");
  }

  const { productId, date } = await searchParams;

  const allowedProductIds =
    session.user.role === "CURATOR"
      ? (
          await prisma.productCurator.findMany({
            where: { curatorId: session.user.id },
            select: { productId: true },
          })
        ).map((x) => x.productId)
      : null;

  const marathons = await prisma.product.findMany({
    where: {
      type: "MARATHON",
      deletedAt: null,
      ...(allowedProductIds ? { id: { in: allowedProductIds } } : {}),
    },
    select: { id: true, title: true, startDate: true },
    orderBy: { title: "asc" },
  });

  const selectedProductId =
    productId && marathons.some((m) => m.id === productId)
      ? productId
      : (marathons[0]?.id ?? null);
  const selected = selectedProductId ? marathons.find((m) => m.id === selectedProductId) ?? null : null;

  const liveEvents = selectedProductId
    ? await prisma.marathonEvent.findMany({
        where: { productId: selectedProductId, type: "LIVE", published: true },
        select: { id: true, title: true, dayOffset: true, scheduledAt: true, createdAt: true },
        orderBy: [{ scheduledAt: "asc" }, { dayOffset: "asc" }, { createdAt: "asc" }],
        take: 200,
      })
    : [];

  const items = liveEvents.map((ev) => {
    const d =
      ev.scheduledAt ??
      (selected?.startDate ? getMarathonEventDate(selected.startDate, ev.dayOffset) : new Date(ev.createdAt));
    return {
      ...ev,
      effectiveAt: d,
      effectiveDateKey: marathonDateKeyInZone(d),
      hasTime: Boolean(ev.scheduledAt),
    };
  });

  const roomStatuses = items.length
    ? new Map(
        (
          await prisma.liveRoom.findMany({
            where: { marathonEventId: { in: items.map((i) => i.id) } },
            select: { marathonEventId: true, status: true },
          })
        ).map((r) => [r.marathonEventId, r.status])
      )
    : new Map<string, "SCHEDULED" | "LIVE" | "ENDED">();

  const selectedDate = date ?? (items[0]?.effectiveDateKey ?? "");
  const filtered = (selectedDate ? items.filter((i) => i.effectiveDateKey === selectedDate) : items)
    .slice()
    .sort((a, b) => {
      // Внутри дня: сначала те, у кого задано время, потом без времени
      if (a.effectiveDateKey === b.effectiveDateKey) {
        if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
        return a.effectiveAt.getTime() - b.effectiveAt.getTime();
      }
      return a.effectiveAt.getTime() - b.effectiveAt.getTime();
    });

  const dates = [...new Set(items.map((i) => i.effectiveDateKey))].sort();
  const now = new Date();
  const todayKey = marathonDateKeyInZone(now);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className={tokens.typography.h2}>Эфиры</h1>
        <div className={`${tokens.typography.small} text-muted-foreground`}>
          Выберите марафон и дату. Вход в комнату доступен только в календарный день эфира (как у студентов),
          даже если сессия в системе ещё помечена как «идёт».
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <label className={cn(tokens.typography.label, "block")}>Марафон</label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              {marathons.map((m) => (
                <Button
                  key={m.id}
                  asChild
                  size="sm"
                  variant={m.id === selectedProductId ? "default" : "outline"}
                  className="h-auto min-h-9 w-full justify-start whitespace-normal px-3 py-2 text-left sm:w-auto sm:max-w-full"
                >
                  <Link href={`/admin/live?productId=${encodeURIComponent(m.id)}`}>{m.title}</Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <label className={cn(tokens.typography.label, "block")}>Дата</label>
            <div className="flex flex-wrap gap-2">
              {dates.length === 0 ? (
                <div className={`${tokens.typography.small} text-muted-foreground`}>Эфиров пока нет.</div>
              ) : (
                dates.map((d) => (
                  <Button
                    key={d}
                    asChild
                    size="sm"
                    variant={d === selectedDate ? "default" : "outline"}
                    className="shrink-0"
                  >
                    <Link
                      href={`/admin/live?productId=${encodeURIComponent(selectedProductId ?? "")}&date=${encodeURIComponent(d)}`}
                    >
                      {d}
                    </Link>
                  </Button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Список эфиров</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <div className={`${tokens.typography.small} text-muted-foreground`}>Нет эфиров для выбранных условий.</div>
          ) : (
            filtered.map((ev) => {
              const joinGate = isMarathonLiveJoinAllowedToday({
                dayOffset: ev.dayOffset,
                scheduledAt: ev.scheduledAt,
                productStartDate: selected?.startDate ?? null,
              });
              const roomStatus = roomStatuses.get(ev.id);
              const liveInDb = roomStatus === "LIVE";
              const inBroadcastDay = joinGate.ok;
              const canOpenRoom = joinGate.ok && roomStatus !== "ENDED";

              const blockReason =
                roomStatus === "ENDED"
                  ? "Эфир завершён, вход в комнату недоступен."
                  : joinGate.ok === false
                    ? marathonLiveJoinDeniedMessage(joinGate)
                    : "Вход недоступен.";

              return (
                <div
                  key={ev.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
                    liveInDb && inBroadcastDay ? "border-primary/40 bg-primary/5" : ""
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium">{ev.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatRuDate(ev.effectiveAt)}</span>
                      <Badge variant="outline">
                        {ev.scheduledAt ? formatRuTime(ev.effectiveAt) : "время не задано"}
                      </Badge>
                      <Badge variant="secondary">LIVE</Badge>
                      {ev.effectiveDateKey === todayKey ? <Badge variant="outline">сегодня</Badge> : null}
                      {liveInDb && inBroadcastDay ? (
                        <Badge variant="success">идёт</Badge>
                      ) : liveInDb && !inBroadcastDay ? (
                        <Badge variant="warning">не завершён в системе</Badge>
                      ) : ev.hasTime &&
                        joinGate.ok &&
                        ev.effectiveAt.getTime() - now.getTime() > 0 &&
                        ev.effectiveAt.getTime() - now.getTime() <= 60 * 60 * 1000 ? (
                        <Badge variant="warning">скоро</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                    {canOpenRoom ? (
                      <Button asChild className="w-full sm:w-auto">
                        <Link href={`/admin/live/${ev.id}`}>В комнату</Link>
                      </Button>
                    ) : (
                      <p className="max-w-md text-sm leading-snug text-muted-foreground sm:text-right">{blockReason}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

