"use client";

import { useState } from "react";
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

type CriteriaPresentation = {
  baseTariffName: string | null;
  included: ProductCriterion[];
  extra: ProductCriterion[];
};

const uniqSorted = (arr: ProductCriterion[]) => [...new Set(arr)].sort();

const isSubset = (small: ProductCriterion[], big: ProductCriterion[]) => {
  const bigSet = new Set(big);
  return small.every((x) => bigSet.has(x));
};

const getCriteriaPresentation = (tariffs: CatalogTariffOption[], currentIndex: number): CriteriaPresentation => {
  const current = uniqSorted(tariffs[currentIndex]?.criteria ?? []);
  const prev = tariffs.slice(0, currentIndex);
  if (prev.length === 0) return { baseTariffName: null, included: current, extra: [] };

  let bestBase: { name: string; criteria: ProductCriterion[] } | null = null;
  for (const t of prev) {
    const base = uniqSorted(t.criteria);
    if (!isSubset(base, current)) continue;
    if (!bestBase || base.length > bestBase.criteria.length) {
      bestBase = { name: t.name, criteria: base };
    }
  }

  if (!bestBase) return { baseTariffName: null, included: current, extra: [] };
  const baseSet = new Set(bestBase.criteria);
  const extra = current.filter((c) => !baseSet.has(c));
  return { baseTariffName: bestBase.name, included: bestBase.criteria, extra };
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

  async function onCheckoutTariff(tariffId: string) {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await createExternalFormCheckout(productId, tariffId);
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
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Тарифы">
          {tariffs.map((t, index) => {
            const presentation = getCriteriaPresentation(tariffs, index);
            return (
              <div key={t.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-muted-foreground">{formatPrice(t.price, t.currency)}</div>
                  </div>
                  <Button type="button" onClick={() => onCheckoutTariff(t.id)} disabled={loading}>
                    {loading ? "…" : "Оплатить"}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {presentation.baseTariffName ? (
                    <p className={`${tokens.typography.small} text-muted-foreground`}>
                      Всё из тарифа <span className="font-medium text-foreground">«{presentation.baseTariffName}»</span>
                      {presentation.extra.length > 0 ? " + " : ""}
                    </p>
                  ) : (
                    <p className={`${tokens.typography.small} font-medium text-foreground`}>Входит в тариф</p>
                  )}

                  {presentation.extra.length > 0 ? (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {presentation.extra.map((c) => (
                        <li key={c}>· {PRODUCT_CRITERION_LABELS[c]}</li>
                      ))}
                    </ul>
                  ) : presentation.baseTariffName ? null : (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {t.criteria.map((c) => (
                        <li key={c}>· {PRODUCT_CRITERION_LABELS[c]}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
