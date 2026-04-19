import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { Plus } from "lucide-react";
import { ProductListRow } from "./product-list-row";

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
          <ProductListRow
            key={product.id}
            productId={product.id}
            title={product.title}
            coverUrl={product.coverUrl}
            type={product.type}
            published={product.published}
            lessonsCount={product._count.lessons}
            enrollmentsCount={product._count.enrollments}
          />
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
