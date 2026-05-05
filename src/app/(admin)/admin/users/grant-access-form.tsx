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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  existingAccesses: Array<{
    productId: string;
    tariffId: string;
    tariffName: string;
  }>;
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

export function GrantAccessForm({ userId, products, existingAccesses }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Выбранный продукт для отображения модалки с тарифами
  const [pickingProduct, setPickingProduct] = useState<Product | null>(null);
  const accessByProduct = new Map(existingAccesses.map((item) => [item.productId, item]));

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
    setMenuOpen(false);
    router.refresh();
  }

  // Клик по продукту в выпадающем списке (Popover закрывается также по клику снаружи)
  function handlePickProduct(product: Product) {
    setMenuOpen(false);
    if (product.tariffs.length > 0) {
      setPickingProduct(product);
      return;
    }
    void doGrant(product.id);
  }

  return (
    <>
      <Popover
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (!next) setError(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Выдать доступ" aria-expanded={menuOpen}>
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-64 max-w-[min(16rem,calc(100vw-2rem))] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-60 overflow-y-auto py-1">
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground">Выдать доступ:</p>
            {products.map((p) => {
              const existing = accessByProduct.get(p.id);

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePickProduct(p)}
                  disabled={loading}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">{p.title}</span>
                  {existing ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Уже выдано: {existing.tariffName}
                    </Badge>
                  ) : null}
                </button>
              );
            })}
            {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
          </div>
        </PopoverContent>
      </Popover>

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
            {pickingProduct ? (
              <div className="pt-2 text-xs text-muted-foreground">
                {accessByProduct.has(pickingProduct.id)
                  ? `Сейчас выдан тариф: ${accessByProduct.get(pickingProduct.id)!.tariffName}`
                  : "Доступ к этому продукту ещё не выдавался."}
              </div>
            ) : null}
          </DialogHeader>

          <div className="space-y-2">
            {pickingProduct?.tariffs.map((t) => {
              const existing = accessByProduct.get(pickingProduct.id);
              const isCurrentTariff = existing?.tariffId === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={loading || isCurrentTariff}
                  onClick={() => pickingProduct && doGrant(pickingProduct.id, t.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    "hover:bg-accent hover:border-primary/40",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    isCurrentTariff ? "border-primary/50 bg-primary/5" : "",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <Badge variant={t.published ? "success" : "outline"} className="text-xs">
                        {t.published ? "В продаже" : "Скрыт"}
                      </Badge>
                      {isCurrentTariff ? (
                        <Badge variant="secondary" className="text-xs">
                          Текущий
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(t.price, t.currency)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-primary">
                    {isCurrentTariff ? "Уже выдан" : "Выдать"}
                  </span>
                </button>
              );
            })}
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
    </>
  );
}
