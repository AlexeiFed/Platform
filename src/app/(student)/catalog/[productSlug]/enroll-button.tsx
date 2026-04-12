"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { createExternalFormCheckout, enrollToProduct } from "./actions";

type Props = {
  productId: string;
  productSlug: string;
  requiresPayment: boolean;
  paymentFormUrl: string | null;
  yoomoneyCheckoutEnabled: boolean;
};

export const EnrollButton = ({
  productId,
  productSlug,
  requiresPayment,
  paymentFormUrl,
  yoomoneyCheckoutEnabled,
}: Props) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onEnrollFree() {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await enrollToProduct(productId);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.success) router.push(`/learn/${productSlug}`);
  }

  async function onCheckout() {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await createExternalFormCheckout(productId);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (!res?.success || !res.data) return;

    if (res.data.mode === "yoomoney") {
      router.push(res.data.oplatitPath);
      return;
    }
    window.open(res.data.checkoutUrl, "_blank", "noopener,noreferrer");
  }

  async function onCheckAccess() {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await enrollToProduct(productId);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.success) router.push(`/learn/${productSlug}`);
  }

  const paidConfigured = yoomoneyCheckoutEnabled || Boolean(paymentFormUrl?.trim());

  if (requiresPayment && !paidConfigured) {
    return (
      <p className={`${tokens.typography.small} text-destructive max-w-md`}>
        Платный курс: не задан кошелёк ЮMoney на сервере и не указана ссылка на форму оплаты в админке.
      </p>
    );
  }

  if (requiresPayment) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" onClick={onCheckout} disabled={loading}>
          {loading ? "…" : "Перейти к оплате"}
        </Button>
        <Button type="button" variant="outline" onClick={onCheckAccess} disabled={loading}>
          Проверить доступ
        </Button>
        {error ? <p className={`${tokens.typography.small} text-destructive w-full`}>{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={onEnrollFree} disabled={loading}>
        {loading ? "Оформляем..." : "Записаться"}
      </Button>
      {error ? <p className={`${tokens.typography.small} text-destructive`}>{error}</p> : null}
    </div>
  );
};
