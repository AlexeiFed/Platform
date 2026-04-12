"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice } from "@/lib/utils";
import type { ProductCriterion } from "@prisma/client";
import { PRODUCT_CRITERION_LABELS } from "@/lib/product-criteria";
import { createTariffUpgradeCheckout } from "./actions";

type TariffOption = {
  id: string;
  name: string;
  price: number;
  currency: string;
  criteria: ProductCriterion[];
};

export const UpgradeTariffPicker = ({
  enrollmentId,
  options,
}: {
  enrollmentId: string;
  options: TariffOption[];
}) => {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onPay = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    const res = await createTariffUpgradeCheckout({ enrollmentId, toTariffId: selected });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (!res.success || !res.data) return;
    if (res.data.mode === "yoomoney") {
      router.push(res.data.oplatitPath);
      return;
    }
    window.open(res.data.checkoutUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2" role="radiogroup" aria-label="Тарифы для апгрейда">
        {options.map((t) => {
          const active = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(t.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${tokens.animation.fast} ${
                active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-muted-foreground mt-0.5">
                {formatPrice(t.price, t.currency)}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {t.criteria.map((c) => (
                  <li key={c}>· {PRODUCT_CRITERION_LABELS[c]}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <Button type="button" onClick={onPay} disabled={loading || !selected}>
        {loading ? "…" : "Перейти к оплате доплаты"}
      </Button>
      {error ? <p className={`${tokens.typography.small} text-destructive`}>{error}</p> : null}
    </div>
  );
};
