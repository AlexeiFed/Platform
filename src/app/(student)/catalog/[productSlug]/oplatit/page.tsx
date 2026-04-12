import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { YooMoneyPayForm } from "./yoomoney-pay-form";

type Props = {
  params: Promise<{ productSlug: string }>;
  searchParams: Promise<{ paymentRef?: string }>;
};

export default async function OplatitPage({ params, searchParams }: Props) {
  const session = await auth();
  const { productSlug } = await params;
  const { paymentRef } = await searchParams;

  const returnPath = `/catalog/${productSlug}/oplatit${paymentRef ? `?paymentRef=${encodeURIComponent(paymentRef)}` : ""}`;

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(returnPath)}`);
  }

  if (!paymentRef?.trim()) {
    redirect(`/catalog/${productSlug}`);
  }

  const receiver = process.env.YOOMONEY_WALLET_RECEIVER?.trim();
  if (!receiver) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <p className={tokens.typography.body}>На сервере не задана переменная YOOMONEY_WALLET_RECEIVER.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href={`/catalog/${productSlug}`}>Назад</Link>
        </Button>
      </div>
    );
  }

  const payment = await prisma.payment.findFirst({
    where: {
      reference: paymentRef.trim(),
      userId: session.user.id,
      status: "PENDING",
      product: { slug: productSlug, deletedAt: null },
    },
    include: { product: { select: { title: true, published: true } } },
  });

  if (!payment) {
    notFound();
  }

  if (!payment.product.published) {
    redirect(`/catalog/${productSlug}`);
  }

  const headersList = await headers();
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <p className={tokens.typography.body}>Не удалось определить хост для successURL (нужен Host / X-Forwarded-Host).</p>
      </div>
    );
  }

  const origin = `${proto}://${host}`;
  const successURL = `${origin}/catalog/${productSlug}?payment=yoomoney_ok`;

  const sum = Number(payment.amount).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      <Button asChild variant="outline" size="sm">
        <Link href={`/catalog/${productSlug}`}>← К курсу</Link>
      </Button>
      <h1 className={tokens.typography.h2}>Оплата в ЮMoney</h1>
      <YooMoneyPayForm
        receiver={receiver}
        sum={sum}
        label={payment.reference}
        successURL={successURL}
        productTitle={payment.product.title}
        productSlug={productSlug}
      />
    </div>
  );
}
