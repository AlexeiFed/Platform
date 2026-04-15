/**
 * landing-editor.tsx
 * Блочный редактор лендинга курса/марафона для администратора.
 * Позволяет добавлять, редактировать и переупорядочивать блоки:
 * hero, heading, text, features, image, video, divider.
 */
"use client";

import { useState, useRef } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LandingRenderer } from "@/app/(student)/catalog/[productSlug]/landing-renderer";
import { tokens } from "@/lib/design-tokens";
import {
  GripVertical, Plus, X, Image as ImageIcon, Film,
  AlignLeft, Heading2, List, Minus, Upload, Loader2,
  LayoutTemplate, Save, Eye, ExternalLink,
} from "lucide-react";
import { updateProductLanding } from "../actions";
import type { LandingBlock } from "@/types/landing";
import { AssetManager } from "../../assets/asset-manager";

// === Утилиты ===

function uid() {
  return crypto.randomUUID();
}

function getPublicUrl(key: string) {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;
  if (!bucket) return key;
  return `https://${bucket}.storage.yandexcloud.net/${key}`;
}

// === Типы блоков для отображения в UI ===

const BLOCK_META: Record<LandingBlock["type"], { label: string; icon: React.ElementType; color: string }> = {
  hero:     { label: "Герой (обложка + заголовок)", icon: LayoutTemplate, color: "text-purple-500" },
  heading:  { label: "Заголовок", icon: Heading2, color: "text-blue-500" },
  text:     { label: "Текст", icon: AlignLeft, color: "text-emerald-500" },
  features: { label: "Список возможностей", icon: List, color: "text-orange-500" },
  image:    { label: "Изображение", icon: ImageIcon, color: "text-cyan-500" },
  video:    { label: "Видео", icon: Film, color: "text-primary" },
  divider:  { label: "Разделитель", icon: Minus, color: "text-muted-foreground" },
};

// === Компонент загрузки изображения ===

function ImageUploader({
  value,
  onChange,
  placeholder = "URL изображения",
}: {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const res = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, path: "landing" }),
      });
      if (!res.ok) return;
      const { url, key } = await res.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      onChange(getPublicUrl(key));
    } catch { /* silent */ }
    setUploading(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted max-h-40">
            <img src={value} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>
              <X className="h-3.5 w-3.5 mr-1" /> Убрать
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}>
              <ImageIcon className="h-3.5 w-3.5 mr-1" /> Хранилище
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-[200px]"
          />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {uploading ? "..." : "Загрузить"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}>
            <ImageIcon className="h-3.5 w-3.5 mr-1" /> Хранилище
          </Button>
        </div>
      )}

      {showPicker && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Выберите изображение</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPicker(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <AssetManager
              onSelect={(url) => { onChange(url); setShowPicker(false); }}
              defaultFilter="image"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// === Редакторы отдельных блоков ===

function HeroEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "hero" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className={tokens.typography.label}>Фоновое изображение</label>
        <ImageUploader value={block.imageUrl} onChange={(url) => onChange({ ...block, imageUrl: url })} />
      </div>
      <div className="space-y-1">
        <label className={tokens.typography.label}>Главный заголовок</label>
        <Input value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Название курса на лендинге" />
      </div>
      <div className="space-y-1">
        <label className={tokens.typography.label}>Подзаголовок / слоган</label>
        <Input value={block.subtitle} onChange={(e) => onChange({ ...block, subtitle: e.target.value })} placeholder="Краткое описание для hero-секции" />
      </div>
    </div>
  );
}

function HeadingEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "heading" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <label className={tokens.typography.label}>Уровень</label>
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
      <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Текст заголовка" />
    </div>
  );
}

function TextEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "text" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <textarea
      value={block.content}
      onChange={(e) => onChange({ ...block, content: e.target.value })}
      placeholder="Основной текст абзаца..."
      className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function FeaturesEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "features" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className={tokens.typography.label}>Заголовок секции</label>
        <Input value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Что вы получите" />
      </div>
      <div className="space-y-2">
        <label className={tokens.typography.label}>Пункты списка</label>
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              onChange={(e) => onChange({ ...block, items: block.items.map((v, idx) => (idx === i ? e.target.value : v)) })}
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

function ImageBlockEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "image" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className={tokens.typography.label}>Изображение</label>
        <ImageUploader value={block.url} onChange={(url) => onChange({ ...block, url })} />
      </div>
      <div className="space-y-1">
        <label className={tokens.typography.label}>Подпись (необязательно)</label>
        <Input value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Подпись к изображению" />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={block.fullWidth}
          onChange={(e) => onChange({ ...block, fullWidth: e.target.checked })}
          className="rounded"
        />
        На всю ширину
      </label>
    </div>
  );
}

function VideoBlockEditor({ block, onChange }: { block: Extract<LandingBlock, { type: "video" }>; onChange: (b: LandingBlock) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className={tokens.typography.label}>URL видео</label>
        <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://..." />
      </div>
      <div className="space-y-1">
        <label className={tokens.typography.label}>Заголовок видео</label>
        <Input value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Описание видео" />
      </div>
    </div>
  );
}

// === Один перетаскиваемый блок ===

function SortableLandingBlock({
  block,
  onChange,
  onRemove,
}: {
  block: LandingBlock;
  onChange: (b: LandingBlock) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;

  return (
    <div ref={setNodeRef} style={style} className="border rounded-xl bg-card overflow-hidden">
      {/* Заголовок блока */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none" aria-label="Перетащить">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
        <span className="text-sm font-medium flex-1">{meta.label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="h-7 px-2">
          {expanded ? "Свернуть" : "Развернуть"}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Содержимое редактора */}
      {expanded && (
        <div className="p-3">
          {block.type === "hero"     && <HeroEditor block={block} onChange={onChange} />}
          {block.type === "heading"  && <HeadingEditor block={block} onChange={onChange} />}
          {block.type === "text"     && <TextEditor block={block} onChange={onChange} />}
          {block.type === "features" && <FeaturesEditor block={block} onChange={onChange} />}
          {block.type === "image"    && <ImageBlockEditor block={block} onChange={onChange} />}
          {block.type === "video"    && <VideoBlockEditor block={block} onChange={onChange} />}
          {block.type === "divider"  && <p className={`${tokens.typography.small} text-center py-2`}>— Визуальный разделитель секций —</p>}
        </div>
      )}
    </div>
  );
}

// === Главный компонент редактора ===

type Props = {
  productId: string;
  productSlug: string;
  initialBlocks: LandingBlock[];
};

export function LandingEditor({ productId, productSlug, initialBlocks }: Props) {
  const [blocks, setBlocks] = useState<LandingBlock[]>(initialBlocks);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function addBlock(type: LandingBlock["type"]) {
    const base = { id: uid() };
    let block: LandingBlock;
    switch (type) {
      case "hero":     block = { ...base, type, title: "", subtitle: "", imageUrl: "" }; break;
      case "heading":  block = { ...base, type, level: 2, text: "" }; break;
      case "text":     block = { ...base, type, content: "" }; break;
      case "features": block = { ...base, type, title: "Что вы получите", items: [""] }; break;
      case "image":    block = { ...base, type, url: "", caption: "", fullWidth: false }; break;
      case "video":    block = { ...base, type, url: "", title: "" }; break;
      case "divider":  block = { ...base, type }; break;
    }
    setBlocks((prev) => [...prev, block]);
  }

  function updateBlock(id: string, updated: LandingBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id);
      const newIdx = prev.findIndex((b) => b.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await updateProductLanding(productId, blocks);
      if (result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } catch {
      setError("Ошибка при сохранении лендинга");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-base">Лендинг (публичная страница курса)</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {saved && <Badge variant="success" className="text-xs">Сохранено</Badge>}
            {blocks.length > 0 && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Предпросмотр
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={`/catalog/${productSlug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </>
            )}
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {saving ? "Сохранение..." : "Сохранить лендинг"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>}

          <p className={tokens.typography.small}>
            Блоки отображаются на публичной странице курса в каталоге. Перетаскивайте блоки для изменения порядка.
          </p>

          {/* Список блоков с drag-and-drop */}
          {blocks.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {blocks.map((block) => (
                    <SortableLandingBlock
                      key={block.id}
                      block={block}
                      onChange={(updated) => updateBlock(block.id, updated)}
                      onRemove={() => removeBlock(block.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-8 text-center space-y-2">
              <LayoutTemplate className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className={tokens.typography.small}>Лендинг пустой. Добавьте блоки ниже.</p>
            </div>
          )}

          {/* Кнопки добавления блоков */}
          <div className="pt-2 border-t space-y-2">
            <p className={`${tokens.typography.small} font-medium`}>Добавить блок:</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(BLOCK_META) as [LandingBlock["type"], typeof BLOCK_META[LandingBlock["type"]]][]).map(([type, meta]) => {
                const Icon = meta.icon;
                return (
                  <Button key={type} type="button" variant="outline" size="sm" onClick={() => addBlock(type)}>
                    <Icon className={`h-3.5 w-3.5 mr-1.5 ${meta.color}`} />
                    {meta.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === Модальный предпросмотр лендинга === */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="shrink-0 flex flex-row items-center justify-between px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">Предпросмотр лендинга</DialogTitle>
            <p className="text-xs text-muted-foreground">Так выглядит страница для студентов</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
              <LandingRenderer blocks={blocks} />
              {blocks.length === 0 && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  Нет блоков для отображения. Добавьте блоки в редакторе.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
