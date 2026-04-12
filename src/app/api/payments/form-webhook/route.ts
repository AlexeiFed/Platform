import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { amountsEqual } from "@/lib/product-payment";
import { Prisma } from "@prisma/client";
import { upsertEnrollmentAfterInitialPaymentTx } from "@/lib/payment-enrollment";
import { tryApplyTariffUpgradeFromPaymentTx } from "@/lib/tariff-upgrade-from-payment";

export const runtime = "nodejs";

const HEADER_SECRET = "x-platform-payment-secret";

const bodySchema = z
  .object({
    reference: z.string().min(8).max(64).optional(),
    paymentRef: z.string().min(8).max(64).optional(),
    amount: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    currency: z.string().max(8).optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (!data.reference && !data.paymentRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Нужно поле reference или paymentRef",
        path: ["reference"],
      });
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Некорректная сумма", path: ["amount"] });
    }
  });

function safeEqualSecret(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Запасной вебхук (например Яндекс.Формы → «Интеграции» → POST JSON).
 * Основной сценарий с ЮMoney — `POST /api/payments/yoomoney-notification` (уведомление от кошелька).
 *
 * Тело: { "reference": "<paymentRef>", "amount": 1990 }.
 * Заголовок: x-platform-payment-secret: <PAYMENT_FORM_WEBHOOK_SECRET>
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_FORM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[form-webhook] PAYMENT_FORM_WEBHOOK_SECRET не задан");
    return NextResponse.json({ ok: false, error: "webhook_disabled" }, { status: 503 });
  }

  const provided = req.headers.get(HEADER_SECRET);
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const reference = parsed.data.reference ?? parsed.data.paymentRef!;
  const { amount } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { reference },
        select: {
          id: true,
          status: true,
          kind: true,
          userId: true,
          productId: true,
          tariffId: true,
          amount: true,
          currency: true,
          product: { select: { slug: true } },
        },
      });

      if (!payment) {
        return { type: "not_found" as const };
      }

      if (payment.status === "SUCCEEDED") {
        return {
          type: "already_ok" as const,
          userId: payment.userId,
          productId: payment.productId,
          slug: payment.product.slug,
        };
      }

      if (payment.status !== "PENDING") {
        return { type: "bad_state" as const, status: payment.status };
      }

      if (!amountsEqual(payment.amount, amount)) {
        return { type: "amount_mismatch" as const };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          rawPayload: json as Prisma.InputJsonValue,
        },
      });

      const fullPay = await tx.payment.findUnique({
        where: { id: payment.id },
        select: {
          id: true,
          kind: true,
          userId: true,
          productId: true,
          tariffId: true,
          product: { select: { slug: true } },
        },
      });
      if (!fullPay) {
        return { type: "bad_state" as const, status: "UNKNOWN" };
      }

      const up = await tryApplyTariffUpgradeFromPaymentTx(tx, fullPay, amount);
      if (up.outcome === "amount_mismatch") {
        return { type: "amount_mismatch" as const };
      }
      if (up.outcome === "bad_state" || up.outcome === "conflict") {
        return { type: "bad_state" as const, status: "UPGRADE" };
      }
      if (up.outcome === "applied") {
        return {
          type: "ok" as const,
          userId: fullPay.userId,
          productId: fullPay.productId,
          slug: fullPay.product.slug,
        };
      }

      const enrollRes = await upsertEnrollmentAfterInitialPaymentTx(tx, {
        userId: fullPay.userId,
        productId: fullPay.productId,
        tariffId: fullPay.tariffId,
      });
      if (!enrollRes.ok) {
        return { type: "bad_state" as const, status: "NO_TARIFF" };
      }

      return {
        type: "ok" as const,
        userId: fullPay.userId,
        productId: fullPay.productId,
        slug: fullPay.product.slug,
      };
    });

    if (result.type === "not_found") {
      return NextResponse.json({ ok: false, error: "payment_not_found" }, { status: 404 });
    }
    if (result.type === "bad_state") {
      return NextResponse.json({ ok: false, error: "invalid_payment_state", status: result.status }, { status: 409 });
    }
    if (result.type === "amount_mismatch") {
      return NextResponse.json({ ok: false, error: "amount_mismatch" }, { status: 409 });
    }

    if (result.type === "ok" || result.type === "already_ok") {
      revalidatePath("/catalog");
      revalidatePath(`/catalog/${result.slug}`);
      revalidatePath(`/learn/${result.slug}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[form-webhook]", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
