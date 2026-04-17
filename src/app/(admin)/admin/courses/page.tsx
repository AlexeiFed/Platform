import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { Plus, Pencil } from "lucide-react";
import { lessonsLabel } from "@/lib/utils";
import { DuplicateProductButton } from "./duplicate-product-button";

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: "COURSE" | "MARATHON" | "ALL" }>;
}) {
  const { type } = await searchParams;
  const selectedType = type ?? "ALL";

  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(selectedType === "ALL" ? {} : { type: selectedType }) },
    include: {
      _count: { select: { lessons: true, enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={tokens.typography.h2}>Курсы и марафоны</h1>
        <Button asChild>
          <Link href="/admin/courses/new">
            <Plus className="h-4 w-4 mr-2" />
            Создать
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button asChild size="sm" variant={selectedType === "ALL" ? "default" : "outline"}>
          <Link href="/admin/courses?type=ALL">Все</Link>
        </Button>
        <Button asChild size="sm" variant={selectedType === "COURSE" ? "default" : "outline"}>
          <Link href="/admin/courses?type=COURSE">Курсы</Link>
        </Button>
        <Button asChild size="sm" variant={selectedType === "MARATHON" ? "default" : "outline"}>
          <Link href="/admin/courses?type=MARATHON">Марафоны</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {products.map((product) => (
          <Card key={product.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4 min-w-0">
                {product.coverUrl && (
                  <img
                    src={product.coverUrl}
                    alt=""
                    className="h-12 w-20 rounded-md object-cover shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{product.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={product.type === "COURSE" ? "default" : "secondary"} className="text-xs">
                      {product.type === "COURSE" ? "Курс" : "Марафон"}
                    </Badge>
                    <Badge variant={product.published ? "success" : "outline"} className="text-xs">
                      {product.published ? "Опубликован" : "Черновик"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {lessonsLabel(product._count.lessons)} · {product._count.enrollments} студентов
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <DuplicateProductButton productId={product.id} />
                <Button variant="ghost" size="icon" asChild>
                  <Link href={`/admin/courses/${product.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {products.length === 0 && (
          <div className="text-center py-12">
            <p className={tokens.typography.body}>Нет курсов. Создайте первый!</p>
          </div>
        )}
      </div>
    </div>
  );
}
