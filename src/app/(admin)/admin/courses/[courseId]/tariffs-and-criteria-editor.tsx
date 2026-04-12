"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import type { ProductCriterion } from "@prisma/client";
import { ALL_PRODUCT_CRITERIA, PRODUCT_CRITERION_LABELS } from "@/lib/product-criteria";
import {
  createProductTariff,
  softDeleteProductTariff,
  updateProductEnabledCriteria,
  updateProductTariff,
} from "./tariff-actions";

export type SerializedTariff = {
  id: string;
  name: string;
  price: number;
  currency: string;
  sortOrder: number;
  published: boolean;
  criteria: ProductCriterion[];
};

type Props = {
  productId: string;
  initialEnabled: ProductCriterion[];
  tariffs: SerializedTariff[];
};

const norm = (list: ProductCriterion[]) => [...list].sort().join(",");

export const TariffsAndCriteriaEditor = ({ productId, initialEnabled, tariffs: initialTariffs }: Props) => {
  const router = useRouter();
  const [enabled, setEnabled] = useState<ProductCriterion[]>(
    initialEnabled.length > 0 ? initialEnabled : ALL_PRODUCT_CRITERIA
  );
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [tariffs, setTariffs] = useState(initialTariffs);
  const [msg, setMsg] = useState("");

  const initialTariffsKey = useMemo(() => JSON.stringify(initialTariffs), [initialTariffs]);
  useEffect(() => {
    setTariffs(JSON.parse(initialTariffsKey) as SerializedTariff[]);
  }, [initialTariffsKey]);

  const initialEnabledKey = useMemo(() => norm(initialEnabled), [initialEnabled]);
  useEffect(() => {
    setEnabled(initialEnabled.length > 0 ? [...initialEnabled] : [...ALL_PRODUCT_CRITERIA]);
  }, [initialEnabledKey]);

  const baselineEnabled = initialEnabled.length > 0 ? initialEnabled : ALL_PRODUCT_CRITERIA;
  const enabledUnchanged = useMemo(() => norm(enabled) === norm(baselineEnabled), [enabled, baselineEnabled]);

  const toggleCriterion = (c: ProductCriterion) => {
    setEnabled((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const saveCriteria = async () => {
    if (enabled.length === 0) {
      setMsg("Выберите хотя бы один критерий продукта");
      return;
    }
    setSavingCriteria(true);
    setMsg("");
    const res = await updateProductEnabledCriteria({ productId, enabledCriteria: enabled });
    setSavingCriteria(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    router.refresh();
  };

  const saveTariff = async (t: SerializedTariff, draft: Partial<SerializedTariff>) => {
    setMsg("");
    const res = await updateProductTariff({
      productId,
      tariffId: t.id,
      name: draft.name ?? t.name,
      price: draft.price ?? t.price,
      currency: draft.currency ?? t.currency,
      sortOrder: draft.sortOrder ?? t.sortOrder,
      published: draft.published ?? t.published,
      criteria: draft.criteria ?? t.criteria,
    });
    if (res.error) {
      setMsg(res.error);
      return;
    }
    setTariffs((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              name: draft.name ?? x.name,
              price: draft.price ?? x.price,
              currency: draft.currency ?? x.currency,
              sortOrder: draft.sortOrder ?? x.sortOrder,
              published: draft.published ?? x.published,
              criteria: draft.criteria ?? x.criteria,
            }
          : x
      )
    );
    router.refresh();
  };

  const addTariff = async () => {
    setMsg("");
    const res = await createProductTariff({
      productId,
      name: "Новый тариф",
      price: 0,
      currency: "RUB",
      sortOrder: (tariffs[tariffs.length - 1]?.sortOrder ?? 0) + 1,
      published: false,
      criteria: enabled.length > 0 ? [...enabled] : ALL_PRODUCT_CRITERIA,
    });
    if (res.error) {
      setMsg(res.error);
      return;
    }
    router.refresh();
  };

  const removeTariff = async (tariffId: string) => {
    setMsg("");
    const res = await softDeleteProductTariff(productId, tariffId);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    setTariffs((prev) => prev.filter((x) => x.id !== tariffId));
    router.refresh();
  };

  const toggleTariffCriterion = (t: SerializedTariff, c: ProductCriterion) => {
    const next = t.criteria.includes(c) ? t.criteria.filter((x) => x !== c) : [...t.criteria, c];
    const allowed = new Set(enabled.length > 0 ? enabled : ALL_PRODUCT_CRITERIA);
    const cleaned = next.filter((x) => allowed.has(x));
    void saveTariff(t, { criteria: cleaned });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Критерии продукта</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={`${tokens.typography.small} text-muted-foreground`}>
            Отметьте, какие возможности вообще доступны для этого запуска. В тарифах можно включить только подмножество.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PRODUCT_CRITERIA.map((c) => (
              <label key={c} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={enabled.includes(c)}
                  onChange={() => toggleCriterion(c)}
                />
                <span>{PRODUCT_CRITERION_LABELS[c]}</span>
              </label>
            ))}
          </div>
          <Button type="button" size="sm" onClick={saveCriteria} disabled={savingCriteria || enabledUnchanged}>
            {savingCriteria ? "Сохранение…" : "Сохранить критерии"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Тарифы</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={addTariff}>
            Добавить тариф
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {tariffs.map((t) => (
            <div key={t.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <Input
                  defaultValue={t.name}
                  className="max-w-xs font-medium"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== t.name) void saveTariff(t, { name: v });
                  }}
                />
                <div className="flex items-center gap-2">
                  <Badge variant={t.published ? "success" : "outline"}>{t.published ? "В продаже" : "Скрыт"}</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeTariff(t.id)}>
                    Удалить
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <div className={`${tokens.typography.small} text-muted-foreground mb-1`}>Цена</div>
                  <Input
                    type="number"
                    className="w-28"
                    defaultValue={t.price}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= 0 && n !== t.price) void saveTariff(t, { price: n });
                    }}
                  />
                </div>
                <div>
                  <div className={`${tokens.typography.small} text-muted-foreground mb-1`}>Порядок</div>
                  <Input
                    type="number"
                    className="w-20"
                    defaultValue={t.sortOrder}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n) && n !== t.sortOrder) void saveTariff(t, { sortOrder: n });
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm pb-1">
                  <input
                    type="checkbox"
                    checked={t.published}
                    onChange={(e) => void saveTariff(t, { published: e.target.checked })}
                  />
                  Опубликован
                </label>
              </div>
              <div>
                <div className={`${tokens.typography.small} font-medium mb-2`}>Входит в тариф</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {enabled.map((c) => (
                    <label key={`${t.id}-${c}`} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={t.criteria.includes(c)}
                        onChange={() => toggleTariffCriterion(t, c)}
                      />
                      <span>{PRODUCT_CRITERION_LABELS[c]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {tariffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Тарифов нет — нажмите «Добавить тариф».</p>
          ) : null}
        </CardContent>
      </Card>

      {msg ? <p className={`${tokens.typography.small} text-destructive`}>{msg}</p> : null}
    </div>
  );
};
