/**
 * Форма выдачи доступа студенту к курсу/марафону админом (без оплаты).
 * После выбора продукта, если у него есть тарифы, открывается модальное
 * окно выбора тарифа — тариф определяет уровень доступа студента.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { grantAccess } from "./actions";

type Tariff = {
  id: string;
  name: string;
  price: number;
  currency: string;
  published: boolean;
};

type Product = {
  id: string;
  title: string;
  tariffs: Tariff[];
};

type Props = {
  userId: string;
  products: Product[];
};

// Формат цены с валютой (минимализм, без полифиллов)
function formatPrice(price: number, currency: string) {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export function GrantAccessForm({ userId, products }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Выбранный продукт для отображения модалки с тарифами
  const [pickingProduct, setPickingProduct] = useState<Product | null>(null);

  // Выдача доступа: если tariffId не указан — используем дефолтный на сервере
  async function doGrant(productId: string, tariffId?: string) {
    setLoading(true);
    setError(null);
    const res = await grantAccess(userId, productId, tariffId);
    setLoading(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    setPickingProduct(null);
    setOpen(false);
    router.refresh();
  }

  // Клик по продукту в выпадающем списке
  function handlePickProduct(product: Product) {
    if (product.tariffs.length > 0) {
      // Есть тарифы — показываем выбор
      setPickingProduct(product);
      return;
    }
    // Тарифов нет — пробуем выдать (сервер вернёт ошибку, если нет ни одного тарифа)
    void doGrant(product.id);
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Выдать доступ">
        <Plus className="h-4 w-4" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute left-0 top-10 z-50 max-h-60 w-64 max-w-[min(16rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg",
            "lg:left-auto lg:right-0",
          )}
        >
          <p className="px-3 py-2 text-xs text-muted-foreground font-medium">Выдать доступ:</p>
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePickProduct(p)}
              disabled={loading}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent truncate"
            >
              {p.title}
            </button>
          ))}
          {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* Модалка выбора тарифа */}
      <Dialog
        open={pickingProduct != null}
        onOpenChange={(o) => {
          if (!o) {
            setPickingProduct(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выбор тарифа</DialogTitle>
            <DialogDescription>
              Выберите тариф для «{pickingProduct?.title}». Тариф определяет уровень доступа
              студента; оплата не требуется.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {pickingProduct?.tariffs.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={loading}
                onClick={() => pickingProduct && doGrant(pickingProduct.id, t.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  "hover:bg-accent hover:border-primary/40",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{t.name}</span>
                    <Badge variant={t.published ? "success" : "outline"} className="text-xs">
                      {t.published ? "В продаже" : "Скрыт"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatPrice(t.price, t.currency)}
                  </p>
                </div>
                <span className="text-xs text-primary shrink-0">Выдать</span>
              </button>
            ))}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickingProduct(null)}
              disabled={loading}
            >
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
