import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice } from "@/lib/utils";
import { isProductPubliclyVisible } from "@/lib/product-visibility";
import { isProductPaidForCatalog, getProductMinPrice } from "@/lib/product-tariff-pricing";
import { PRODUCT_CRITERION_LABELS } from "@/lib/product-criteria";
import { EnrollButton } from "./enroll-button";

type Props = {
  params: Promise<{ productSlug: string }>;
  searchParams: Promise<{ payment?: string }>;
};

export default async function ProductDetailsPage({ params, searchParams }: Props) {
  const { productSlug } = await params;
  const { payment: paymentQuery } = await searchParams;
  const session = await auth();

  const product = await prisma.product.findUnique({
    where: { slug: productSlug, deletedAt: null },
    select: {
      id: true,
      type: true,
      title: true,
      slug: true,
      description: true,
      price: true,
      currency: true,
      published: true,
      startDate: true,
      durationDays: true,
      paymentFormUrl: true,
      deletedAt: true,
      _count: { select: { lessons: true } },
      tariffs: {
        where: { published: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        select: { id: true, name: true, price: true, currency: true, criteria: true },
      },
    },
  });

  if (!product || !isProductPubliclyVisible(product)) notFound();

  const enrollment =
    session?.user?.id != null
      ? await prisma.enrollment.findUnique({
          where: { userId_productId: { userId: session.user.id, productId: product.id } },
        })
      : null;

  const loginWithReturn = `/login?callbackUrl=${encodeURIComponent(`/catalog/${product.slug}`)}`;
  const yoomoneyCheckoutEnabled = Boolean(process.env.YOOMONEY_WALLET_RECEIVER?.trim());

  const paid = await isProductPaidForCatalog(product.id);
  const minPrice = await getProductMinPrice(product.id);
  const tariffOptions = product.tariffs.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: t.currency,
    criteria: t.criteria,
  }));

  const shouldShowTariffs = tariffOptions.length > 0 && !enrollment;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {paymentQuery === "yoomoney_ok" ? (
        <p className={`${tokens.typography.small} rounded-lg border border-primary/30 bg-primary/5 px-3 py-2`}>
          Если оплату в ЮMoney вы завершили, подождите несколько секунд и нажмите «Проверить доступ». Если закрыли
          оплату без перевода — вернитесь на страницу оплаты и нажмите «Оплату не завершил».
        </p>
      ) : null}
      <div>
        <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
          {product.type === "COURSE" ? "Курс" : "Марафон"}
        </Badge>
        <h1 className={`${tokens.typography.h2} mt-2`}>{product.title}</h1>
        {product.description && <p className={`${tokens.typography.body} mt-2`}>{product.description}</p>}
      </div>

      {shouldShowTariffs ? (
        <section className="space-y-3" aria-labelledby="catalog-tariffs-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="catalog-tariffs-heading" className={tokens.typography.h3}>
              Тарифы
            </h2>
            {!session ? (
              <Button asChild variant="outline" size="sm">
                <Link href={loginWithReturn}>Войти, чтобы оплатить</Link>
              </Button>
            ) : null}
          </div>

          {session ? (
            <EnrollButton
              productId={product.id}
              productSlug={product.slug}
              requiresPayment={paid}
              paymentFormUrl={product.paymentFormUrl}
              yoomoneyCheckoutEnabled={yoomoneyCheckoutEnabled}
              tariffs={tariffOptions}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {tariffOptions.map((t) => (
                <Card key={t.id} className={tokens.shadow.card}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t.name}</CardTitle>
                    <p className="text-base font-semibold text-primary">{formatPrice(t.price, t.currency)}</p>
                  </CardHeader>
                  <CardContent>
                    <p className={`${tokens.typography.small} font-medium text-foreground mb-2`}>Входит в тариф</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {t.criteria.map((c) => (
                        <li key={c}>· {PRODUCT_CRITERION_LABELS[c]}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Card className={tokens.shadow.card}>
        <CardHeader>
          <CardTitle>Детали</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Уроков</span>
            <span className="font-medium">{product._count.lessons}</span>
          </div>
          {tariffOptions.length === 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Цена</span>
              <span className="font-semibold">
                {minPrice ? formatPrice(minPrice.price, minPrice.currency) : "Бесплатно"}
              </span>
            </div>
          ) : null}
          {product.type === "MARATHON" && product.startDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Старт</span>
              <span className="font-medium">
                {new Intl.DateTimeFormat("ru-RU").format(product.startDate)}
              </span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/catalog">Назад</Link>
          </Button>
          {!session ? (
            <Button asChild>
              <Link href={loginWithReturn}>Войти, чтобы записаться</Link>
            </Button>
          ) : enrollment ? (
            <Button asChild>
              <Link href={`/learn/${product.slug}`}>Открыть</Link>
            </Button>
          ) : (
            paid ? null : (
              <EnrollButton
                productId={product.id}
                productSlug={product.slug}
                requiresPayment={paid}
                paymentFormUrl={product.paymentFormUrl}
                yoomoneyCheckoutEnabled={yoomoneyCheckoutEnabled}
                tariffs={tariffOptions}
              />
            )
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

