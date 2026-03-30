"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { grantAccess } from "./actions";

type Props = {
  userId: string;
  products: { id: string; title: string }[];
};

export function GrantAccessForm({ userId, products }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleGrant(productId: string) {
    setLoading(true);
    await grantAccess(userId, productId);
    setLoading(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Выдать доступ">
        <Plus className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-10 w-64 bg-popover border rounded-lg shadow-lg py-1 z-50 max-h-60 overflow-y-auto">
          <p className="px-3 py-2 text-xs text-muted-foreground font-medium">Выдать доступ:</p>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => handleGrant(p.id)}
              disabled={loading}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent truncate"
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
