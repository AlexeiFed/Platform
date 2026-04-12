import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice, lessonsLabel } from "@/lib/utils";
import { isProductPubliclyVisible } from "@/lib/product-visibility";
import { getProductMinPrice } from "@/lib/product-tariff-pricing";
import Link from "next/link";

export default async function CatalogPage() {
  const products = await prisma.product.findMany({
    where: { published: true, deletedAt: null },
    include: { _count: { select: { lessons: true } } },
    orderBy: { createdAt: "desc" },
  });

  const visibleProducts = products.filter(isProductPubliclyVisible);
  const courses = visibleProducts.filter((product) => product.type === "COURSE");
  const marathons = visibleProducts.filter((product) => product.type === "MARATHON");

  const minPriceEntries = await Promise.all(
    visibleProducts.map(async (p) => [p.id, await getProductMinPrice(p.id)] as const)
  );
  const minPriceByProductId = new Map(minPriceEntries);

  const renderProducts = (items: typeof visibleProducts) => (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((product) => (
        <Card key={product.id} className={tokens.shadow.card}>
          {product.coverUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
              <img
                src={product.coverUrl}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <CardHeader>
            <div className="mb-1 flex items-center gap-2">
              <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
                {product.type === "COURSE" ? "Курс" : "Марафон"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {lessonsLabel(product._count.lessons)}
              </span>
            </div>
            <CardTitle className="text-lg">{product.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product.description && (
              <p className="text-sm text-muted-foreground line-clamp-3">{product.description}</p>
            )}
            {product.type === "MARATHON" && product.startDate && (
              <p className="text-sm font-medium">Старт: {new Intl.DateTimeFormat("ru-RU").format(product.startDate)}</p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <span className="text-lg font-bold">
              {(() => {
                const min = minPriceByProductId.get(product.id);
                return min ? formatPrice(min.price, min.currency) : "Бесплатно";
              })()}
            </span>
            <Button asChild size="sm">
              <Link href={`/catalog/${product.slug}`}>Подробнее</Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Каталог</h1>
        <p className={tokens.typography.body}>Выберите программу для обучения</p>
      </div>

      {courses.length > 0 && (
        <section className="space-y-4">
          <h2 className={tokens.typography.h3}>Курсы</h2>
          {renderProducts(courses)}
        </section>
      )}

      {marathons.length > 0 && (
        <section className="space-y-4">
          <h2 className={tokens.typography.h3}>Марафоны</h2>
          {renderProducts(marathons)}
        </section>
      )}

      {visibleProducts.length === 0 && (
        <div className="py-12 text-center">
          <p className={tokens.typography.body}>Пока нет доступных программ</p>
        </div>
      )}
    </div>
  );
}
