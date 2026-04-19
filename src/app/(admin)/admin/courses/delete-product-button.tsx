/**
 * Кнопка удаления продукта (курс/марафон) с модальным подтверждением.
 * Использует Dialog вместо window.confirm — надёжнее и соответствует UI-стилю.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { softDeleteProduct } from "./actions";

type Props = {
  productId: string;
  title: string;
  enrollmentsCount: number;
};

export function DeleteProductButton({ productId, title, enrollmentsCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Подтверждённое удаление: вызывается из модалки
  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await softDeleteProduct(productId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Удалить"
        disabled={pending}
        className="text-destructive hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
      </Button>
      {error && <p className="max-w-[10rem] text-right text-xs text-destructive">{error}</p>}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          if (!o) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить «{title}»?</DialogTitle>
            <DialogDescription>
              Продукт скроется из списка и каталога (можно восстановить вручную в БД).
              {enrollmentsCount > 0 && (
                <>
                  {" "}
                  Есть <span className="font-medium text-foreground">{enrollmentsCount}</span>{" "}
                  записей студентов — доступ к материалам у них сохранится, но продукт пропадёт из
                  каталога.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
