import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Prisma, type PaymentStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";

const STATUS_ORDER: PaymentStatus[] = ["PENDING", "SUCCEEDED", "CANCELLED", "FAILED"];

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Ожидает оплату",
  SUCCEEDED: "Оплачено",
  CANCELLED: "Отменено",
  FAILED: "Ошибка",
};

const STATUS_BADGE: Record<PaymentStatus, "warning" | "success" | "outline" | "destructive" | "secondary"> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  CANCELLED: "outline",
  FAILED: "destructive",
};

function parseProductId(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim();
  if (!/^[0-9a-f-]{36}$/i.test(v)) return undefined;
  return v;
}

function parseStatus(raw: string | undefined): PaymentStatus | undefined {
  if (!raw?.trim()) return undefined;
  return STATUS_ORDER.includes(raw as PaymentStatus) ? (raw as PaymentStatus) : undefined;
}

type YooMoneyPayload = {
  sender?: string;
  datetime?: string;
  notification_type?: string;
  withdraw_amount?: string;
  amount?: string;
  operation_id?: string;
};

function readYooMoneyExtras(raw: Prisma.JsonValue | null): YooMoneyPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return {
    sender: str("sender"),
    datetime: str("datetime"),
    notification_type: str("notification_type"),
    withdraw_amount: str("withdraw_amount"),
    amount: str("amount"),
    operation_id: str("operation_id"),
  };
}

function stageHint(
  status: PaymentStatus,
  enrolled: boolean
): { text: string; tone: "muted" | "warning" | "success" | "destructive" } {
  if (status === "PENDING") {
    return {
      text: "Студент не завершил оплату или вебхук от ЮMoney ещё не пришёл (после оплаты — до минуты).",
      tone: "warning",
    };
  }
  if (status === "SUCCEEDED") {
    if (enrolled) {
      return { text: "Деньги зачислены, доступ к курсу выдан.", tone: "success" };
    }
    return {
      text: "Оплата в БД есть, зачисления нет — проверьте вебхук или нажмите «Записаться» у студента.",
      tone: "destructive",
    };
  }
  if (status === "CANCELLED") {
    return {
      text: "Заявка снята («Оплату не завершил») или заменена новой попыткой оплаты.",
      tone: "muted",
    };
  }
  return { text: "Платёж отмечен как ошибочный.", tone: "destructive" };
}

const LIST_LIMIT = 400;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const productId = parseProductId(sp.productId);
  const status = parseStatus(sp.status);

  const where: Prisma.PaymentWhereInput = {
    ...(productId ? { productId } : {}),
    ...(status ? { status } : {}),
  };

  const [filterProducts, statsRows, totalCount, payments] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null, type: { in: ["COURSE", "MARATHON"] } },
      select: { id: true, title: true, type: true, published: true, price: true },
      orderBy: { title: "asc" },
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      take: LIST_LIMIT,
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, title: true, slug: true, type: true, price: true } },
      },
    }),
  ]);

  const statsMap = Object.fromEntries(statsRows.map((r) => [r.status, r._count._all])) as Partial<
    Record<PaymentStatus, number>
  >;

  const enrollmentKeys =
    payments.length > 0
      ? await prisma.enrollment.findMany({
          where: {
            OR: payments.map((p) => ({ userId: p.userId, productId: p.productId })),
          },
          select: { userId: true, productId: true },
        })
      : [];
  const enrolledSet = new Set(enrollmentKeys.map((e) => `${e.userId}:${e.productId}`));

  const productTypeLabel = (t: string) => (t === "MARATHON" ? "Марафон" : "Курс");

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Оплаты</h1>
        <p className={`mt-1 ${tokens.typography.body}`}>
          Заявки на оплату и статусы вебхуков ЮMoney. Фильтруйте по продукту и статусу, чтобы увидеть, на каком этапе студент.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className={tokens.typography.h4}>Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <label htmlFor="productId" className={tokens.typography.label}>
                Курс / марафон
              </label>
              <select
                id="productId"
                name="productId"
                defaultValue={productId ?? ""}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <option value="">Все продукты</option>
                {filterProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({productTypeLabel(p.type)}
                    {!p.published ? ", не опубликован" : ""}
                    {p.price == null || Number(p.price) <= 0 ? ", без цены" : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[200px] flex-col gap-1.5">
              <label htmlFor="status" className={tokens.typography.label}>
                Статус платежа
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status ?? ""}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <option value="">Все статусы</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Применить</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/payments">Сбросить</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{STATUS_LABELS[s]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{statsMap[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={tokens.typography.small}>
          Всего записей по фильтру: <strong>{totalCount}</strong>
          {totalCount > LIST_LIMIT ? ` · Показаны последние ${LIST_LIMIT} по дате обновления` : null}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="p-3">Студент</th>
                  <th className="p-3">Продукт</th>
                  <th className="p-3">Сумма</th>
                  <th className="p-3">Статус</th>
                  <th className="p-3">Этап</th>
                  <th className="p-3">Даты</th>
                  <th className="p-3">Реквизиты / ЮMoney</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Нет платежей по выбранным условиям.
                    </td>
                  </tr>
                ) : (
                  payments.map((row) => {
                    const enrolled = enrolledSet.has(`${row.userId}:${row.productId}`);
                    const hint = stageHint(row.status, enrolled);
                    const ym = readYooMoneyExtras(row.rawPayload);
                    const toneClass =
                      hint.tone === "success"
                        ? "text-green-700 dark:text-green-400"
                        : hint.tone === "warning"
                          ? "text-amber-700 dark:text-amber-400"
                          : hint.tone === "destructive"
                            ? "text-destructive"
                            : "text-muted-foreground";

                    return (
                      <tr key={row.id} className="border-b align-top last:border-0 hover:bg-muted/20">
                        <td className="p-3">
                          <Link
                            href={`/admin/users/${row.user.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.user.name ?? "—"}
                          </Link>
                          <div className="mt-0.5 break-all text-xs text-muted-foreground">{row.user.email}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {enrolled ? (
                              <Badge variant="success" className="text-[10px]">
                                Зачислен
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Нет зачисления
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{row.product.title}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {productTypeLabel(row.product.type)}
                            </Badge>
                            <Button variant="link" className="h-auto p-0 text-xs" asChild>
                              <Link href={`/catalog/${row.product.slug}`} target="_blank" rel="noreferrer">
                                Каталог
                              </Link>
                            </Button>
                          </div>
                        </td>
                        <td className="p-3 tabular-nums">
                          {formatPrice(Number(row.amount), row.currency)}
                          {row.product.price != null && Number(row.product.price) > 0 ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              цена курса {formatPrice(Number(row.product.price), row.currency)}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <Badge variant={STATUS_BADGE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                        </td>
                        <td className={`p-3 max-w-[240px] text-xs ${toneClass}`}>{hint.text}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          <div>Создан: {formatDateTime(row.createdAt)}</div>
                          <div className="mt-1">Обновлён: {formatDateTime(row.updatedAt)}</div>
                        </td>
                        <td className="p-3 font-mono text-xs break-all">
                          <div title={row.reference}>
                            <span className="text-muted-foreground">reference: </span>
                            {row.reference}
                          </div>
                          {row.yoomoneyOperationId ? (
                            <div className="mt-1" title={row.yoomoneyOperationId}>
                              <span className="text-muted-foreground">operation_id: </span>
                              {row.yoomoneyOperationId}
                            </div>
                          ) : (
                            <div className="mt-1 text-muted-foreground">operation_id: —</div>
                          )}
                          {ym.sender ? (
                            <div className="mt-1">
                              <span className="text-muted-foreground">sender: </span>
                              {ym.sender}
                            </div>
                          ) : null}
                          {ym.datetime ? (
                            <div className="mt-1">
                              <span className="text-muted-foreground">ЮMoney datetime: </span>
                              {ym.datetime}
                            </div>
                          ) : null}
                          {ym.notification_type ? (
                            <div className="mt-1">
                              <span className="text-muted-foreground">тип: </span>
                              {ym.notification_type}
                            </div>
                          ) : null}
                          {(ym.withdraw_amount || ym.amount) && row.status === "SUCCEEDED" ? (
                            <div className="mt-1 text-muted-foreground">
                              сумма в уведомлении: {ym.withdraw_amount ?? ym.amount} {row.currency}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
