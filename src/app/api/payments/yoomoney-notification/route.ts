import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { amountsEqual } from "@/lib/product-payment";
import { verifyYooMoneyNotificationSha1 } from "@/lib/yoomoney-notification-verify";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function okResponse() {
  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function paramsToRecord(body: URLSearchParams): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of body.entries()) {
    o[k] = v;
  }
  return o;
}

/**
 * Официальное HTTP-уведомление ЮMoney о входящем переводе (application/x-www-form-urlencoded).
 * В QuickPay в поле `label` передаётся `payment.reference` с нашей страницы оплаты.
 * @see https://yoomoney.ru/docs/payment-buttons/using-api/notifications
 */
export async function POST(req: Request) {
  const secret = process.env.YOOMONEY_NOTIFICATION_SECRET?.trim();
  if (!secret) {
    console.error("[yoomoney-notification] YOOMONEY_NOTIFICATION_SECRET не задан");
    return new NextResponse("disabled", { status: 503 });
  }

  const raw = await req.text();
  const body = new URLSearchParams(raw);

  if (!verifyYooMoneyNotificationSha1(body, secret)) {
    return new NextResponse("bad hash", { status: 403 });
  }

  const label = body.get("label")?.trim();
  // Кнопка «Протестировать» в кабинете ЮMoney часто шлёт уведомление без label: достаточно успешной проверки sha1_hash.
  if (!label) {
    return okResponse();
  }

  const operation_id = body.get("operation_id")?.trim();
  if (!operation_id) {
    return new NextResponse("no operation_id", { status: 400 });
  }

  const withdrawRaw = body.get("withdraw_amount")?.trim();
  const amountRaw = body.get("amount")?.trim();
  const paidBySender = withdrawRaw && withdrawRaw !== "" ? Number(withdrawRaw) : Number(amountRaw ?? "");
  if (!Number.isFinite(paidBySender) || paidBySender <= 0) {
    return new NextResponse("bad amount", { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const byOp = await tx.payment.findFirst({
        where: { yoomoneyOperationId: operation_id },
        select: { status: true, product: { select: { slug: true } } },
      });
      if (byOp?.status === "SUCCEEDED") {
        return { type: "dup_ok" as const, slug: byOp.product.slug };
      }
      if (byOp) {
        return { type: "conflict" as const };
      }

      const payment = await tx.payment.findUnique({
        where: { reference: label },
        select: {
          id: true,
          status: true,
          userId: true,
          productId: true,
          amount: true,
          yoomoneyOperationId: true,
          product: { select: { slug: true } },
        },
      });

      if (!payment) {
        return { type: "not_found" as const };
      }

      if (payment.status === "SUCCEEDED") {
        return { type: "dup_ok" as const, slug: payment.product.slug };
      }

      if (payment.status !== "PENDING") {
        return { type: "bad_state" as const };
      }

      if (!amountsEqual(payment.amount, paidBySender)) {
        return { type: "amount_mismatch" as const };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          yoomoneyOperationId: operation_id,
          rawPayload: paramsToRecord(body) as Prisma.InputJsonValue,
        },
      });

      await tx.enrollment.upsert({
        where: { userId_productId: { userId: payment.userId, productId: payment.productId } },
        create: { userId: payment.userId, productId: payment.productId },
        update: {},
      });

      return { type: "ok" as const, slug: payment.product.slug };
    });

    if (result.type === "not_found") {
      return new NextResponse("unknown label", { status: 404 });
    }
    if (result.type === "conflict" || result.type === "bad_state") {
      return new NextResponse("conflict", { status: 409 });
    }
    if (result.type === "amount_mismatch") {
      return new NextResponse("amount mismatch", { status: 409 });
    }

    revalidatePath("/catalog");
    revalidatePath(`/catalog/${result.slug}`);
    revalidatePath(`/learn/${result.slug}`);

    return okResponse();
  } catch (e) {
    console.error("[yoomoney-notification]", e);
    return new NextResponse("error", { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ path: "/api/payments/yoomoney-notification", method: "POST" });
}
