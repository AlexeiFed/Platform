"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { Plus, X } from "lucide-react";
import type { LandingBlock } from "@/types/landing";

export type HeadingContentBlock = Extract<LandingBlock, { type: "heading" }>;
export type FeaturesContentBlock = Extract<LandingBlock, { type: "features" }>;

export function HeadingBlockEditor({
  block,
  onChange,
}: {
  block: HeadingContentBlock;
  onChange: (block: HeadingContentBlock) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={tokens.typography.label}>Уровень</span>
        <div className="flex gap-1">
          {([2, 3] as const).map((l) => (
            <Button
              key={l}
              type="button"
              size="sm"
              variant={block.level === l ? "default" : "outline"}
              onClick={() => onChange({ ...block, level: l })}
              className="w-10"
            >
              H{l}
            </Button>
          ))}
        </div>
      </div>
      <Input
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Текст заголовка"
      />
    </div>
  );
}

export function FeaturesBlockEditor({
  block,
  onChange,
}: {
  block: FeaturesContentBlock;
  onChange: (block: FeaturesContentBlock) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className={tokens.typography.label}>Заголовок секции</label>
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Заголовок списка"
        />
      </div>
      <div className="space-y-2">
        <label className={tokens.typography.label}>Пункты списка</label>
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((v, idx) => (idx === i ? e.target.value : v)),
                })
              }
              placeholder={`Пункт ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...block, items: [...block.items, ""] })}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Добавить пункт
        </Button>
      </div>
    </div>
  );
}
