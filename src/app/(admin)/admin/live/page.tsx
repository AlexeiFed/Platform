import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMarathonEventDate } from "@/lib/marathon-progress";

type Props = {
  searchParams: Promise<{ productId?: string; date?: string }>;
};

function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRuDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function formatRuTime(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default async function AdminLivePage({ searchParams }: Props) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    redirect("/login");
  }

  const { productId, date } = await searchParams;

  const marathons = await prisma.product.findMany({
    where: { type: "MARATHON", deletedAt: null },
    select: { id: true, title: true, startDate: true },
    orderBy: { title: "asc" },
  });

  const selectedProductId = productId ?? marathons[0]?.id ?? null;
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
      effectiveDateKey: dateKey(d),
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
  const todayKey = dateKey(now);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className={tokens.typography.h2}>Эфиры</h1>
        <div className={`${tokens.typography.small} text-muted-foreground`}>
          Выберите марафон и дату — увидите запланированные события «Эфир» и сможете зайти в комнату.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className={tokens.typography.label}>Марафон</div>
            <div className="flex flex-wrap gap-2">
              {marathons.map((m) => (
                <Button
                  key={m.id}
                  asChild
                  size="sm"
                  variant={m.id === selectedProductId ? "default" : "outline"}
                >
                  <Link href={`/admin/live?productId=${encodeURIComponent(m.id)}`}>{m.title}</Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className={tokens.typography.label}>Дата</div>
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
            filtered.map((ev) => (
              <div
                key={ev.id}
                className={[
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                  roomStatuses.get(ev.id) === "LIVE" ? "border-primary/40 bg-primary/5" : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{ev.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{formatRuDate(ev.effectiveAt)}</span>
                    <Badge variant="outline">{ev.scheduledAt ? formatRuTime(ev.effectiveAt) : "время не задано"}</Badge>
                    <Badge variant="secondary">LIVE</Badge>
                    {ev.effectiveDateKey === todayKey ? <Badge variant="outline">сегодня</Badge> : null}
                    {roomStatuses.get(ev.id) === "LIVE" ? (
                      <Badge variant="success">идёт</Badge>
                    ) : ev.hasTime && ev.effectiveAt.getTime() - now.getTime() > 0 && ev.effectiveAt.getTime() - now.getTime() <= 60 * 60 * 1000 ? (
                      <Badge variant="warning">скоро</Badge>
                    ) : null}
                  </div>
                </div>
                <Button asChild>
                  <Link href={`/admin/live/${ev.id}`}>В комнату</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

