import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GradesProductSelect } from "./grades-product-select";
import {
  formatRatingsForRefs,
  loadGradesMatrix,
  type GradeColumn,
  type GradeRow,
} from "./load-grades-matrix";

type Props = {
  searchParams: Promise<{ productId?: string }>;
};

export default async function AdminGradesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") {
    redirect("/dashboard");
  }

  const { productId: productIdParam } = await searchParams;

  const allowedProductIds =
    session.user.role === "CURATOR"
      ? (
          await prisma.productCurator.findMany({
            where: { curatorId: session.user.id },
            select: { productId: true },
          })
        ).map((x) => x.productId)
      : null;

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(allowedProductIds ? { id: { in: allowedProductIds } } : {}),
    },
    select: { id: true, title: true, type: true },
    orderBy: { title: "asc" },
  });

  const selectedProductId =
    productIdParam && products.some((p) => p.id === productIdParam)
      ? productIdParam
      : (products[0]?.id ?? null);

  const matrix = selectedProductId ? await loadGradesMatrix(selectedProductId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Оценки</h1>
        <p className={tokens.typography.body}>
          Оценки нагрузки по блокам уроков (0–10). В строках — только студенты выбранного продукта, в колонках —
          тренировки или уроки с блоком оценки.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка фильтра…</p>}>
        <GradesProductSelect products={products} selectedProductId={selectedProductId} />
      </Suspense>

      {!selectedProductId ? (
        <Card>
          <CardContent className={cn(tokens.typography.body, "p-6")}>
            Нет курсов или марафонов для отображения.
          </CardContent>
        </Card>
      ) : !matrix ? (
        <Card>
          <CardContent className={cn(tokens.typography.body, "p-6")}>Продукт не найден.</CardContent>
        </Card>
      ) : matrix.columns.length === 0 ? (
        <Card>
          <CardContent className={cn("space-y-2 p-6", tokens.typography.body)}>
            <p>
              Для «{matrix.product.title}» пока нет колонок: в марафоне нет событий типа «Тренировка» с уроками, либо в
              уроках курса нет блоков оценки.
            </p>
            <p className="text-sm">
              <Link href="/admin/courses" className="text-primary hover:underline">
                Настроить курс
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <GradesTable
          productTitle={matrix.product.title}
          productType={matrix.product.type}
          columns={matrix.columns}
          rows={matrix.rows}
          ratingMap={matrix.ratingMap}
        />
      )}
    </div>
  );
}

const GradesTable = ({
  productTitle,
  productType,
  columns,
  rows,
  ratingMap,
}: {
  productTitle: string;
  productType: "COURSE" | "MARATHON";
  columns: GradeColumn[];
  rows: GradeRow[];
  ratingMap: Map<string, number>;
}) => (
  <Card>
    <CardContent className="p-0">
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={tokens.typography.label}>Выбрано</span>
          <span className="font-medium">{productTitle}</span>
          <Badge variant={productType === "MARATHON" ? "secondary" : "default"}>
            {productType === "MARATHON" ? "Марафон" : "Курс"}
          </Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-30 min-w-[160px] border-b border-r bg-card px-4 py-4 font-medium text-foreground shadow-[1px_0_0_0_hsl(var(--border))]">
                Фамилия
              </th>
              {columns.map((col) =>
                col.kind === "marathon_training" ? (
                  <th key={col.eventId} className="min-w-[128px] border-b bg-card px-2 py-3 align-bottom font-medium">
                    <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
                      <div className="text-[11px] leading-tight text-muted-foreground">День {col.dayOffset}</div>
                      <div className="mt-1 line-clamp-3 text-xs font-semibold leading-snug text-foreground" title={col.title}>
                      {col.title}
                      </div>
                    </div>
                  </th>
                ) : (
                  <th key={col.lessonId} className="min-w-[128px] max-w-[190px] border-b bg-card px-2 py-3 align-bottom font-medium">
                    <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
                      <div className="line-clamp-4 text-xs font-semibold leading-snug text-foreground" title={col.lessonTitle}>
                        {col.lessonTitle}
                      </div>
                    </div>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Нет зачисленных студентов с ролью «Студент».
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.enrollmentId} className="group">
                  <td className="sticky left-0 z-10 border-b border-r bg-card px-4 py-3 font-medium shadow-[1px_0_0_0_hsl(var(--border))] group-hover:bg-accent/30">
                    <span title={row.fullName}>{row.surname}</span>
                  </td>
                  {columns.map((col) => {
                    const text = formatRatingsForRefs(col.refs, row.enrollmentId, ratingMap);
                    return (
                      <td
                        key={col.kind === "marathon_training" ? col.eventId : col.lessonId}
                        className="border-b px-2 py-2 text-center align-middle tabular-nums group-hover:bg-accent/30"
                      >
                        <span
                          className={cn(
                            "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold",
                            text === "—"
                              ? "text-muted-foreground"
                              : "bg-primary/10 text-primary ring-1 ring-primary/15",
                          )}
                        >
                          {text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
);
