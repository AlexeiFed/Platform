"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { createExternalFormCheckout, enrollToProduct } from "./actions";
import { formatPrice } from "@/lib/utils";
import type { ProductCriterion } from "@prisma/client";
import { PRODUCT_CRITERION_LABELS } from "@/lib/product-criteria";

export type CatalogTariffOption = {
  id: string;
  name: string;
  price: number;
  currency: string;
  criteria: ProductCriterion[];
};

type Props = {
  productId: string;
  productSlug: string;
  requiresPayment: boolean;
  paymentFormUrl: string | null;
  yoomoneyCheckoutEnabled: boolean;
  tariffs: CatalogTariffOption[];
};

export const EnrollButton = ({
  productId,
  productSlug,
  requiresPayment,
  paymentFormUrl,
  yoomoneyCheckoutEnabled,
  tariffs,
}: Props) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const defaultTariffId = useMemo(() => tariffs[0]?.id ?? "", [tariffs]);
  const [selectedTariffId, setSelectedTariffId] = useState(defaultTariffId);

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
    if (!selectedTariffId) {
      setError("Выберите тариф");
      return;
    }
    setLoading(true);
    setError("");
    const res = await createExternalFormCheckout(productId, selectedTariffId);
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

  if (requiresPayment && tariffs.length === 0) {
    return (
      <p className={`${tokens.typography.small} text-destructive max-w-md`}>
        Нет опубликованных тарифов — админ должен добавить тарифы в курсе.
      </p>
    );
  }

  if (requiresPayment) {
    return (
      <div className="flex flex-col gap-3">
        <div className="space-y-2" role="radiogroup" aria-label="Тариф">
          {tariffs.map((t) => {
            const active = t.id === selectedTariffId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedTariffId(t.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${tokens.animation.fast} ${
                  active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-muted-foreground">{formatPrice(t.price, t.currency)}</div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {t.criteria.map((c) => (
                    <li key={c}>· {PRODUCT_CRITERION_LABELS[c]}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="button" onClick={onCheckout} disabled={loading}>
            {loading ? "…" : "Перейти к оплате"}
          </Button>
          <Button type="button" variant="outline" onClick={onCheckAccess} disabled={loading}>
            Проверить доступ
          </Button>
          {error ? <p className={`${tokens.typography.small} text-destructive w-full`}>{error}</p> : null}
        </div>
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
