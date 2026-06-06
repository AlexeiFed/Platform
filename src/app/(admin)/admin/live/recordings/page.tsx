import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMarathonEventDate } from "@/lib/marathon-progress";
import { marathonDateKeyInZone } from "@/lib/marathon-live-broadcast";
import { getResolvedMarathonTimeZone } from "@/lib/marathon-time-zone";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

export const dynamic = "force-dynamic";

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

function formatDuration(sec: number | null | undefined) {
  if (sec == null || sec < 1) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function formatSize(bytes: bigint | null | undefined) {
  if (bytes == null) return null;
  const mb = Number(bytes) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb.toFixed(1)} МБ`;
}

export default async function AdminLiveRecordingsPage({ searchParams }: Props) {
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

  const rawRecordings = selectedProductId
    ? await prisma.liveRoomRecording.findMany({
        where: {
          status: "READY",
          manifestUrl: { not: null },
          room: {
            marathonEvent: {
              productId: selectedProductId,
              type: "LIVE",
              published: true,
            },
          },
        },
        select: {
          id: true,
          manifestUrl: true,
          durationSec: true,
          sizeBytes: true,
          createdAt: true,
          room: {
            select: {
              marathonEvent: {
                select: {
                  id: true,
                  title: true,
                  dayOffset: true,
                  scheduledAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];

  type EventGroup = {
    eventId: string;
    title: string;
    effectiveAt: Date;
    effectiveDateKey: string;
    hasTime: boolean;
    recordings: typeof rawRecordings;
  };

  const eventMap = new Map<string, EventGroup>();

  for (const rec of rawRecordings) {
    const ev = rec.room.marathonEvent;
    const effectiveAt =
      ev.scheduledAt ??
      (selected?.startDate ? getMarathonEventDate(selected.startDate, ev.dayOffset) : new Date(ev.createdAt));

    if (!eventMap.has(ev.id)) {
      eventMap.set(ev.id, {
        eventId: ev.id,
        title: ev.title,
        effectiveAt,
        effectiveDateKey: marathonDateKeyInZone(effectiveAt),
        hasTime: Boolean(ev.scheduledAt),
        recordings: [],
      });
    }
    eventMap.get(ev.id)!.recordings.push(rec);
  }

  const groups = [...eventMap.values()].sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());

  const dates = [...new Set(groups.map((g) => g.effectiveDateKey))].sort().reverse();
  const selectedDate = date ?? (dates[0] ?? "");
  const filtered = selectedDate ? groups.filter((g) => g.effectiveDateKey === selectedDate) : groups;

  const listHref = (extra?: { productId?: string; date?: string }) => {
    const pid = extra?.productId ?? selectedProductId ?? "";
    const d = extra?.date ?? selectedDate;
    const params = new URLSearchParams();
    if (pid) params.set("productId", pid);
    if (d) params.set("date", d);
    const qs = params.toString();
    return qs ? `/admin/live/recordings?${qs}` : "/admin/live/recordings";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className={tokens.typography.h2}>Записи эфиров</h1>
        <div className={`${tokens.typography.small} text-muted-foreground`}>
          Просмотр сохранённых записей экрана после завершения эфира. Записи доступны независимо от календарного
          дня трансляции.
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
                  <Link href={listHref({ productId: m.id, date: "" })}>{m.title}</Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <label className={cn(tokens.typography.label, "block")}>Дата</label>
            <div className="flex flex-wrap gap-2">
              {dates.length === 0 ? (
                <div className={`${tokens.typography.small} text-muted-foreground`}>Записей пока нет.</div>
              ) : (
                dates.map((d) => (
                  <Button
                    key={d}
                    asChild
                    size="sm"
                    variant={d === selectedDate ? "default" : "outline"}
                    className="shrink-0"
                  >
                    <Link href={listHref({ date: d })}>{d}</Link>
                  </Button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Список записей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filtered.length === 0 ? (
            <div className={`${tokens.typography.small} text-muted-foreground`}>
              Нет записей для выбранных условий.
            </div>
          ) : (
            filtered.map((group) => (
              <div key={group.eventId} className="rounded-lg border p-4 space-y-3">
                <div className="min-w-0">
                  <div className="break-words font-medium">{group.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{formatRuDate(group.effectiveAt)}</span>
                    <Badge variant="outline">
                      {group.hasTime ? formatRuTime(group.effectiveAt) : "время не задано"}
                    </Badge>
                    <Badge variant="secondary">
                      {group.recordings.length}{" "}
                      {group.recordings.length === 1
                        ? "запись"
                        : group.recordings.length < 5
                          ? "записи"
                          : "записей"}
                    </Badge>
                  </div>
                </div>
                <ul className="space-y-2">
                  {group.recordings.map((rec, idx) => (
                    <li
                      key={rec.id}
                      className="flex flex-col gap-2 rounded-md bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className={`${tokens.typography.small} text-muted-foreground`}>
                        <span className="font-medium text-foreground">Запись {group.recordings.length - idx}</span>
                        {" · "}
                        {rec.createdAt.toLocaleString("ru-RU", { timeZone: marathonTz })}
                        {formatDuration(rec.durationSec) ? ` · ${formatDuration(rec.durationSec)}` : null}
                        {formatSize(rec.sizeBytes) ? ` · ${formatSize(rec.sizeBytes)}` : null}
                      </div>
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <Link href={`/admin/live/recordings/${rec.id}?${new URLSearchParams({ productId: selectedProductId ?? "", date: selectedDate }).toString()}`}>
                          <Play className="mr-1.5 h-4 w-4" aria-hidden />
                          Смотреть
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
