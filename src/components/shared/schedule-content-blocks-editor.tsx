/**
 * schedule-content-blocks-editor.tsx
 * Редактор блоков расписания марафона: заголовок, текст, список возможностей.
 */
"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { confirmDeletion } from "@/lib/confirm-deletion";
import { cn } from "@/lib/utils";
import { GripVertical, Plus, X, AlignLeft, Heading2, List } from "lucide-react";
import type { ScheduleContentBlock } from "@/types/marathon-schedule";

function uid() {
  return crypto.randomUUID();
}

const BLOCK_META: Record<
  ScheduleContentBlock["type"],
  { label: string; icon: React.ElementType; color: string }
> = {
  heading: { label: "Заголовок", icon: Heading2, color: "text-blue-500" },
  text: { label: "Текст", icon: AlignLeft, color: "text-emerald-500" },
  features: { label: "Список возможностей", icon: List, color: "text-orange-500" },
};

function HeadingEditor({
  block,
  onChange,
}: {
  block: Extract<ScheduleContentBlock, { type: "heading" }>;
  onChange: (b: ScheduleContentBlock) => void;
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

function TextEditor({
  block,
  onChange,
}: {
  block: Extract<ScheduleContentBlock, { type: "text" }>;
  onChange: (b: ScheduleContentBlock) => void;
}) {
  return (
    <textarea
      value={block.content}
      onChange={(e) => onChange({ ...block, content: e.target.value })}
      placeholder="Основной текст..."
      className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function FeaturesEditor({
  block,
  onChange,
}: {
  block: Extract<ScheduleContentBlock, { type: "features" }>;
  onChange: (b: ScheduleContentBlock) => void;
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

function SortableBlock({
  block,
  onChange,
  onRemove,
}: {
  block: ScheduleContentBlock;
  onChange: (b: ScheduleContentBlock) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;

  return (
    <div ref={setNodeRef} style={style} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none active:cursor-grabbing"
          aria-label="Перетащить"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
        <span className="flex-1 text-sm font-medium">{meta.label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="h-7 px-2">
          {expanded ? "Свернуть" : "Развернуть"}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="p-3">
          {block.type === "heading" && <HeadingEditor block={block} onChange={onChange} />}
          {block.type === "text" && <TextEditor block={block} onChange={onChange} />}
          {block.type === "features" && <FeaturesEditor block={block} onChange={onChange} />}
        </div>
      )}
    </div>
  );
}

type Props = {
  blocks: ScheduleContentBlock[];
  onChange: (blocks: ScheduleContentBlock[]) => void;
  compact?: boolean;
};

export function ScheduleContentBlocksEditor({ blocks, onChange, compact }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function addBlock(type: ScheduleContentBlock["type"]) {
    const base = { id: uid() };
    let block: ScheduleContentBlock;
    switch (type) {
      case "heading":
        block = { ...base, type, level: 2, text: "" };
        break;
      case "text":
        block = { ...base, type, content: "" };
        break;
      case "features":
        block = { ...base, type, title: "", items: [""] };
        break;
    }
    onChange([...blocks, block]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    onChange(arrayMove(blocks, oldIdx, newIdx));
  }

  return (
    <div className={cn("space-y-3", compact && "text-sm")}>
      {blocks.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {blocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  onChange={(updated) => onChange(blocks.map((b) => (b.id === block.id ? updated : b)))}
                  onRemove={() => {
                    if (!confirmDeletion("Удалить этот блок?")) return;
                    onChange(blocks.filter((b) => b.id !== block.id));
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className={cn(tokens.typography.small, "rounded-lg border border-dashed px-3 py-4 text-center")}>
          Блоков пока нет
        </p>
      )}

      <div className="space-y-2 border-t pt-2">
        <p className={cn(tokens.typography.small, "font-medium")}>Добавить блок:</p>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BLOCK_META) as [ScheduleContentBlock["type"], (typeof BLOCK_META)[ScheduleContentBlock["type"]]][]).map(
            ([type, meta]) => {
              const Icon = meta.icon;
              return (
                <Button key={type} type="button" variant="outline" size="sm" onClick={() => addBlock(type)}>
                  <Icon className={cn("mr-1.5 h-3.5 w-3.5", meta.color)} />
                  {meta.label}
                </Button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
