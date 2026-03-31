"use client";

import { useState, useEffect, useRef } from "react";
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
import { tokens } from "@/lib/design-tokens";
import {
  Plus, GripVertical, FileText, Film, X, Pencil, Trash2,
  Eye, EyeOff, Image as ImageIcon, Upload, Loader2,
  ClipboardList,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createLesson, updateLesson, deleteLesson, reorderLessons, updateProduct,
} from "../actions";
import { AssetManager } from "../../assets/asset-manager";
import type { ProductType, UnlockRule } from "@prisma/client";

// === Types ===

export type ContentBlock = {
  id: string;
  type: "text" | "video" | "image";
  content: string;
};

type SerializedProduct = {
  id: string;
  type: ProductType;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  price: number | null;
  currency: string;
  published: boolean;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SerializedLesson = {
  id: string;
  productId: string;
  title: string;
  slug: string;
  order: number;
  content: string | null;
  videoUrl: string | null;
  blocks: ContentBlock[] | null;
  homeworkEnabled: boolean;
  homeworkQuestions: string[] | null;
  unlockRule: UnlockRule;
  unlockDate: string | null;
  unlockDay: number | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { submissions: number };
};

type ProductForm = {
  title: string;
  description: string;
  coverUrl: string;
  price: string;
  startDate: string;
};

function uid() {
  return crypto.randomUUID();
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPublicUrl(key: string) {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;
  if (!bucket) return key;
  return `https://${bucket}.storage.yandexcloud.net/${key}`;
}

// === Sortable Lesson Item ===

function SortableLesson({
  lesson, index, onEdit, onTogglePublish, onDelete,
}: {
  lesson: SerializedLesson;
  index: number;
  onEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const blocks = lesson.blocks ?? [];
  const blockSummary = blocks.length
    ? blocks.map((b) => (b.type === "text" ? "Т" : b.type === "video" ? "В" : "И")).join("·")
    : lesson.videoUrl ? "В" : lesson.content ? "Т" : "—";

  return (
    <Card ref={setNodeRef} style={style} className="group">
      <CardContent className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none" aria-label="Перетащить">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </button>
        <span className="text-sm text-muted-foreground w-8">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{lesson.title}</p>
          <p className="text-xs text-muted-foreground">
            [{blockSummary}]
            {lesson.homeworkEnabled && " · ДЗ"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button type="button" variant="ghost" size="icon" onClick={onTogglePublish}>
              {lesson.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Badge variant={lesson.published ? "success" : "outline"} className="text-xs ml-1">
            {lesson.published ? "Опубл." : "Черн."}
          </Badge>
          {lesson._count.submissions > 0 && (
            <Badge variant="secondary" className="text-xs">{lesson._count.submissions} ДЗ</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// === Media Block (non-sortable internals) ===

function MediaBlockEditor({
  block,
  onUpdate,
  onRemove,
}: {
  block: ContentBlock;
  onUpdate: (content: string) => void;
  onRemove: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const autoPrefix = file.type.startsWith("video/") ? "videos" : "images";
    setUploading(true);
    try {
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, path: autoPrefix }),
      });
      if (!presignRes.ok) { setUploading(false); return; }
      const { url, key } = await presignRes.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      onUpdate(getPublicUrl(key));
    } catch { /* silent */ }
    setUploading(false);
    e.target.value = "";
  }

  function applyUrl() {
    const val = urlRef.current?.value?.trim();
    if (val) onUpdate(val);
  }

  const typeLabel = block.type === "video" ? "Видео" : "Изображение";
  const TypeIcon = block.type === "video" ? Film : ImageIcon;
  const iconColor = block.type === "video" ? "text-purple-500" : "text-blue-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TypeIcon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm font-medium">{typeLabel}</span>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {block.content ? (
        <div className="space-y-2">
          {block.type === "image" && (
            <div className="rounded-lg overflow-hidden border bg-muted max-h-48">
              <img src={block.content} alt="" className="w-full h-auto max-h-48 object-contain" />
            </div>
          )}
          {block.type === "video" && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
              <Film className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="text-xs truncate flex-1">{block.content.split("/").pop()}</span>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate("")}>
            <X className="h-3 w-3 mr-1" /> Убрать
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <Input
              ref={urlRef}
              placeholder={block.type === "video" ? "URL видео" : "URL изображения"}
              onBlur={applyUrl}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyUrl())}
              className="flex-1 min-w-[180px]"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPicker(!showPicker)}>
              <Film className="h-3.5 w-3.5 mr-1" /> Хранилище
            </Button>
            <div className="relative">
              <input
                type="file"
                accept={block.type === "video" ? "video/*" : "image/*"}
                onChange={handleUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={uploading}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                {uploading ? "..." : "Загрузить"}
              </Button>
            </div>
          </div>

          {showPicker && (
            <Card className="border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {block.type === "video" ? "Выберите видео" : "Выберите изображение"}
                  </CardTitle>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setShowPicker(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <AssetManager
                  onSelect={(url) => { onUpdate(url); setShowPicker(false); }}
                  defaultFilter={block.type === "video" ? "video" : "image"}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// === Sortable Block Wrapper ===

function SortableBlock({
  block, onUpdate, onRemove,
}: {
  block: ContentBlock;
  onUpdate: (content: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-3 bg-card">
      <div className="flex gap-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none mt-1 shrink-0">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          {block.type === "text" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Текст</span>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <textarea
                value={block.content}
                onChange={(e) => onUpdate(e.target.value)}
                placeholder="Текст (HTML/Markdown)..."
                className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <MediaBlockEditor block={block} onUpdate={onUpdate} onRemove={onRemove} />
          )}
        </div>
      </div>
    </div>
  );
}

// === Main Editor ===

export function CourseEditor({
  product,
  lessons: initialLessons,
}: {
  product: SerializedProduct;
  lessons: SerializedLesson[];
}) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initialLessons);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLessons(initialLessons);
  }, [initialLessons]);

  const [showNewLesson, setShowNewLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<SerializedLesson | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [hwEnabled, setHwEnabled] = useState(false);
  const [hwQuestions, setHwQuestions] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>({
    title: product.title,
    description: product.description ?? "",
    coverUrl: product.coverUrl ?? "",
    price: product.price ? String(product.price) : "",
    startDate: toDateInputValue(product.startDate),
  });
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setProductForm({
      title: product.title,
      description: product.description ?? "",
      coverUrl: product.coverUrl ?? "",
      price: product.price ? String(product.price) : "",
      startDate: toDateInputValue(product.startDate),
    });
  }, [product.id, product.title, product.description, product.coverUrl, product.price, product.startDate]);

  const lessonSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const blockSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // === Lesson CRUD ===

  async function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = lessons.findIndex((l) => l.id === active.id);
    const newIdx = lessons.findIndex((l) => l.id === over.id);
    const reordered = arrayMove(lessons, oldIdx, newIdx);
    setLessons(reordered);
    await reorderLessons(product.id, reordered.map((l) => l.id));
  }

  async function handleToggleProductPublish() {
    try {
      setSaving(true);
      const result = await updateProduct(product.id, {
        title: productForm.title.trim(),
        type: product.type as "COURSE" | "MARATHON",
        description: productForm.description.trim() || undefined,
        coverUrl: productForm.coverUrl.trim() || undefined,
        price: productForm.price.trim() ? Number(productForm.price.trim()) : undefined,
        currency: product.currency,
        published: !product.published,
        startDate: product.type === "MARATHON" ? productForm.startDate || undefined : undefined,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (err) {
      console.error("[handleToggleProductPublish]", err);
      setError("Ошибка при обновлении курса");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      setError("");
      setSuccessMsg("");

      const title = productForm.title.trim();
      const description = productForm.description.trim();
      const coverUrl = productForm.coverUrl.trim();
      const priceNum = productForm.price.trim() ? Number(productForm.price.trim()) : undefined;
      const startDate = productForm.startDate.trim();

      const result = await updateProduct(product.id, {
        title,
        type: product.type as "COURSE" | "MARATHON",
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        price: Number.isFinite(priceNum as number) ? (priceNum as number) : undefined,
        currency: product.currency,
        published: product.published,
        startDate: product.type === "MARATHON" ? startDate || undefined : undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMsg("Курс обновлён");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleSaveProduct]", err);
      setError("Ошибка при обновлении курса");
    } finally {
      setSaving(false);
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setCoverUploading(true);
    try {
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          path: "courses",
        }),
      });
      if (!presignRes.ok) {
        setCoverUploading(false);
        return;
      }
      const { url, key } = await presignRes.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setProductForm((p) => ({ ...p, coverUrl: getPublicUrl(key) }));
    } catch {
      /* silent */
    }
    setCoverUploading(false);
    e.target.value = "";
  }

  async function handleToggleLessonPublish(lesson: SerializedLesson) {
    try {
      const result = await updateLesson(lesson.id, {
        title: lesson.title,
        blocks: lesson.blocks ?? undefined,
        homeworkEnabled: lesson.homeworkEnabled,
        homeworkQuestions: lesson.homeworkQuestions ?? undefined,
        unlockRule: lesson.unlockRule,
        published: !lesson.published,
      });
      if (result.success) {
        setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, published: !l.published } : l)));
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error("[handleToggleLessonPublish]", err);
      setError("Ошибка при обновлении урока");
    }
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm("Удалить урок? Действие нельзя отменить.")) return;
    try {
      const result = await deleteLesson(lessonId);
      if (result.success) {
        setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error("[handleDeleteLesson]", err);
      setError("Ошибка при удалении урока");
    }
  }

  // === Block helpers ===

  function addBlock(type: ContentBlock["type"]) {
    setBlocks((prev) => [...prev, { id: uid(), type, content: "" }]);
  }

  function updateBlock(id: string, content: string) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id);
      const newIdx = prev.findIndex((b) => b.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  // === Form ===

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");

    try {
      const fd = new FormData(e.currentTarget);
      const title = fd.get("title") as string;
      const unlockRule = (fd.get("unlockRule") as "IMMEDIATELY" | "AFTER_HOMEWORK_APPROVAL" | "SPECIFIC_DATE") ?? "IMMEDIATELY";
      const currentBlocks = blocks.length > 0 ? [...blocks] : undefined;
      const currentHwQuestions = hwEnabled && hwQuestions.length > 0 ? hwQuestions.filter(Boolean) : undefined;
      const payload = {
        title,
        blocks: currentBlocks,
        homeworkEnabled: hwEnabled,
        homeworkQuestions: currentHwQuestions,
        unlockRule,
        published: editingLesson?.published ?? false,
      };

      if (editingLesson) {
        const result = await updateLesson(editingLesson.id, payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        setLessons((prev) => prev.map((l) =>
          l.id === editingLesson.id
            ? { ...l, title, blocks: currentBlocks ?? null, homeworkEnabled: hwEnabled, homeworkQuestions: currentHwQuestions ?? null, unlockRule: unlockRule as UnlockRule }
            : l
        ));
      } else {
        const result = await createLesson(product.id, payload);
        if (result.error) {
          setError(result.error);
          return;
        }
      }

      resetForm();
      setSuccessMsg("Урок сохранён");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleSave]", err);
      setError("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setShowNewLesson(false);
    setEditingLesson(null);
    setBlocks([]);
    setHwEnabled(false);
    setHwQuestions([]);
  }

  function openEdit(lesson: SerializedLesson) {
    setEditingLesson(lesson);
    setShowNewLesson(false);

    if (lesson.blocks && lesson.blocks.length > 0) {
      setBlocks(lesson.blocks.map((b) => ({ ...b })));
    } else {
      const migrated: ContentBlock[] = [];
      if (lesson.videoUrl) migrated.push({ id: uid(), type: "video", content: lesson.videoUrl });
      if (lesson.content) migrated.push({ id: uid(), type: "text", content: lesson.content });
      setBlocks(migrated);
    }

    setHwEnabled(lesson.homeworkEnabled);
    setHwQuestions(lesson.homeworkQuestions ?? []);
  }

  function openNew() {
    resetForm();
    setShowNewLesson(true);
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>}
      {successMsg && <div className="bg-green-500/10 text-green-700 dark:text-green-400 text-sm p-3 rounded-lg">{successMsg}</div>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Курс / марафон</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={product.type === "COURSE" ? "default" : "secondary"} className="text-xs">
              {product.type === "COURSE" ? "Курс" : "Марафон"}
            </Badge>
            <Badge variant={product.published ? "success" : "outline"} className="text-xs">
              {product.published ? "Опубликован" : "Черновик"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="space-y-2">
              <label className={tokens.typography.label}>Название</label>
              <Input
                value={productForm.title}
                onChange={(e) => setProductForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className={tokens.typography.label}>Описание</label>
              <textarea
                value={productForm.description}
                onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Коротко: что внутри и для кого"
                className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={tokens.typography.label}>Обложка</label>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                />

                {productForm.coverUrl ? (
                  <div className="space-y-2">
                    <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                      <img src={productForm.coverUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProductForm((p) => ({ ...p, coverUrl: "" }))}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Убрать
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCoverPicker((v) => !v)}
                      >
                        <ImageIcon className="h-3.5 w-3.5 mr-1" /> Хранилище
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={coverUploading}
                        onClick={() => coverFileRef.current?.click()}
                      >
                        {coverUploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        {coverUploading ? "..." : "Загрузить"}
                      </Button>
                    </div>

                    {showCoverPicker && (
                      <Card className="border-primary/30">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Выберите обложку</CardTitle>
                            <Button type="button" variant="ghost" size="icon" onClick={() => setShowCoverPicker(false)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <AssetManager
                            onSelect={(url) => { setProductForm((p) => ({ ...p, coverUrl: url })); setShowCoverPicker(false); }}
                            defaultFilter="image"
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCoverPicker((v) => !v)}
                      >
                        <ImageIcon className="h-3.5 w-3.5 mr-1" /> Хранилище
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={coverUploading}
                        onClick={() => coverFileRef.current?.click()}
                      >
                        {coverUploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        {coverUploading ? "..." : "Загрузить"}
                      </Button>
                      <Input
                        value={productForm.coverUrl}
                        onChange={(e) => setProductForm((p) => ({ ...p, coverUrl: e.target.value }))}
                        placeholder="или вставьте URL https://..."
                        className="min-w-[220px] flex-1"
                      />
                    </div>

                    {showCoverPicker && (
                      <Card className="border-primary/30">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Выберите обложку</CardTitle>
                            <Button type="button" variant="ghost" size="icon" onClick={() => setShowCoverPicker(false)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <AssetManager
                            onSelect={(url) => { setProductForm((p) => ({ ...p, coverUrl: url })); setShowCoverPicker(false); }}
                            defaultFilter="image"
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className={tokens.typography.label}>Цена (RUB)</label>
                <Input
                  inputMode="decimal"
                  value={productForm.price}
                  onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            {product.type === "MARATHON" && (
              <div className="space-y-2">
                <label className={tokens.typography.label}>Дата старта марафона</label>
                <Input
                  type="date"
                  value={productForm.startDate}
                  onChange={(e) => setProductForm((p) => ({ ...p, startDate: e.target.value }))}
                  required
                />
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button type="submit" disabled={saving}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </Button>
              <Button
                type="button"
                onClick={handleToggleProductPublish}
                variant={product.published ? "outline" : "default"}
                disabled={saving}
              >
                {product.published ? "Снять с публикации" : "Опубликовать"}
              </Button>
              <Button type="button" variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Добавить урок
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* === LESSON FORM === */}
      {(showNewLesson || editingLesson) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingLesson ? `Редактирование: ${editingLesson.title}` : "Новый урок"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className={tokens.typography.label}>Название</label>
                <Input name="title" placeholder="Название урока" defaultValue={editingLesson?.title ?? ""} required />
              </div>

              {/* === CONTENT BLOCKS === */}
              <div className="space-y-3">
                <label className={tokens.typography.label}>Контент урока</label>
                <p className="text-xs text-muted-foreground">
                  Добавляйте блоки. Порядок блоков = порядок у студента.
                </p>

                {blocks.length > 0 && mounted && (
                  <DndContext sensors={blockSensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
                    <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {blocks.map((block) => (
                          <SortableBlock
                            key={block.id}
                            block={block}
                            onUpdate={(c) => updateBlock(block.id, c)}
                            onRemove={() => removeBlock(block.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {blocks.length === 0 && (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground">
                    <p className="text-sm">Нет блоков. Добавьте первый ↓</p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("text")}>
                    <FileText className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> + Текст
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("video")}>
                    <Film className="h-3.5 w-3.5 mr-1.5 text-purple-500" /> + Видео
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("image")}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5 text-blue-500" /> + Изображение
                  </Button>
                </div>
              </div>

              {/* === HOMEWORK === */}
              <div className="space-y-3 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                    <ClipboardList className="h-4 w-4 text-orange-500" />
                    Домашнее задание
                  </label>
                  <Button
                    type="button"
                    variant={hwEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHwEnabled(!hwEnabled)}
                  >
                    {hwEnabled ? "Включено" : "Выключено"}
                  </Button>
                </div>

                {hwEnabled && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Вопросы ДЗ (студент увидит их и должен ответить на каждый)</p>
                    {hwQuestions.map((q, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={q}
                          onChange={(e) => setHwQuestions((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                          placeholder={`Вопрос ${i + 1}`}
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => setHwQuestions((prev) => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setHwQuestions((prev) => [...prev, ""])}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Добавить вопрос
                    </Button>
                  </div>
                )}
              </div>

              {/* Unlock rule */}
              <div className="space-y-2">
                <label className={tokens.typography.label}>Правило открытия</label>
                <select
                  name="unlockRule"
                  defaultValue={editingLesson?.unlockRule ?? "IMMEDIATELY"}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="IMMEDIATELY">Сразу</option>
                  <option value="AFTER_HOMEWORK_APPROVAL">После проверки ДЗ</option>
                  <option value="SPECIFIC_DATE">По дате</option>
                </select>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Сохраняем..." : editingLesson ? "Сохранить" : "Создать урок"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>Отмена</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* === LESSONS LIST === */}
      <div className="space-y-2">
        <h2 className={tokens.typography.h4}>Уроки ({lessons.length})</h2>
        {mounted ? (
          <DndContext sensors={lessonSensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
            <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {lessons.map((lesson, idx) => (
                <SortableLesson
                  key={lesson.id}
                  lesson={lesson}
                  index={idx}
                  onEdit={() => openEdit(lesson)}
                  onTogglePublish={() => handleToggleLessonPublish(lesson)}
                  onDelete={() => handleDeleteLesson(lesson.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, idx) => (
              <Card key={lesson.id} className="group">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="w-5" />
                  <span className="text-sm text-muted-foreground w-8">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lesson.title}</p>
                    {!lesson.slug && (
                      <p className="text-xs text-muted-foreground">⚠ slug пустой — сохраните урок, чтобы ссылка заработала</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {lessons.length === 0 && <p className={tokens.typography.small}>Нет уроков. Добавьте первый!</p>}
      </div>
    </div>
  );
}
