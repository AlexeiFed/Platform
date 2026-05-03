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
import { confirmDeletion } from "@/lib/confirm-deletion";
import {
  Plus, GripVertical, FileText, Film, X, Pencil, Trash2,
  Eye, EyeOff, Image as ImageIcon, Upload, Loader2,
  ClipboardList, CalendarDays, ArrowUp, ArrowDown, ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  createLesson, updateLesson, deleteLesson, reorderLessons, updateProduct,
} from "../actions";
import {
  createMarathonEvent,
  deleteMarathonEvent,
  reorderMarathonEvents,
  updateMarathonEvent,
} from "./marathon-actions";
import { AssetManager } from "../../assets/asset-manager";
import { LandingEditor } from "./landing-editor";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { MarathonEventLessonPicker } from "./marathon-event-lesson-picker";
import { loadPdfJs } from "@/components/shared/pdfjs-loader";
import type { LandingBlock } from "@/types/landing";
import type { MarathonEventType, MarathonTrack, ProductCriterion, ProductType, UnlockRule } from "@prisma/client";

// === Types ===

export type ContentBlock = {
  id: string;
  type: "text" | "video" | "image" | "pdf";
  content: string;
  /** Только для type=image: ширина блока на странице студента */
  size?: "full" | "half" | "third";
  /** Только для type=pdf: готовые картинки страниц (для быстрого рендера у ученика) */
  pages?: string[];
};

type SerializedProduct = {
  id: string;
  type: ProductType;
  title: string;
  slug: string;
  description: string | null;
  rules: string | null;
  coverUrl: string | null;
  price: number | null;
  currency: string;
  paymentFormUrl: string | null;
  published: boolean;
  startDate: string | null;
  durationDays: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  enabledCriteria?: ProductCriterion[];
  landingBlocks: LandingBlock[];
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

type SerializedMarathonEvent = {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  type: MarathonEventType;
  track: MarathonTrack;
  dayOffset: number;
  weekNumber: number | null;
  position: number;
  lessonIds: string[];
  blocks: unknown;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductForm = {
  title: string;
  description: string;
  rules: string;
  coverUrl: string;
  price: string;
  paymentFormUrl: string;
  startDate: string;
  durationDays: string;
};

type MarathonEventForm = {
  title: string;
  description: string;
  type: MarathonEventType;
  track: MarathonTrack;
  dayOffset: string;
  weekNumber: string;
  lessonIds: string[];
  published: boolean;
};

const marathonEventTypeOptions: { value: MarathonEventType; label: string }[] = [
  { value: "INFO", label: "Инфо" },
  { value: "TRAINING", label: "Тренировка" },
  { value: "NUTRITION", label: "Питание" },
  { value: "PROCEDURE", label: "Процедуры" },
  { value: "BONUS", label: "Бонус" },
  { value: "LIVE", label: "Эфир" },
  { value: "RESULT", label: "Результат" },
];

const marathonTrackOptions: { value: MarathonTrack; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "HOME", label: "Дом" },
  { value: "GYM", label: "Зал" },
];

function getEmptyMarathonEventForm(): MarathonEventForm {
  return {
    title: "",
    description: "",
    type: "INFO",
    track: "ALL",
    dayOffset: "0",
    weekNumber: "",
    lessonIds: [],
    published: false,
  };
}

function MarathonEventFields({
  form,
  onPatch,
  lessons,
}: {
  form: MarathonEventForm;
  onPatch: (patch: Partial<MarathonEventForm>) => void;
  lessons: SerializedLesson[];
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className={tokens.typography.label}>Название события</label>
          <Input
            value={form.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder="Например, Питание: энергетический баланс"
            required
          />
        </div>
        <div className="space-y-2">
          <label className={tokens.typography.label}>Тип события</label>
          <select
            value={form.type}
            onChange={(e) => onPatch({ type: e.target.value as MarathonEventType })}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {marathonEventTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className={tokens.typography.label}>Описание</label>
        <RichTextEditor
          value={form.description}
          onChange={(val) => onPatch({ description: val })}
          placeholder="Короткое описание события, что нужно сделать или посмотреть"
          minHeight="100px"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className={tokens.typography.label}>День марафона</label>
          <Input
            type="number"
            min="0"
            value={form.dayOffset}
            onChange={(e) => onPatch({ dayOffset: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <label className={tokens.typography.label}>Неделя</label>
          <Input
            type="number"
            min="0"
            value={form.weekNumber}
            onChange={(e) => onPatch({ weekNumber: e.target.value })}
            placeholder="0 — подготовка, 1+ — недели"
          />
        </div>
        <div className="space-y-2">
          <label className={tokens.typography.label}>Трек</label>
          <select
            value={form.track}
            onChange={(e) => onPatch({ track: e.target.value as MarathonTrack })}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {marathonTrackOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MarathonEventLessonPicker
        lessons={lessons.map((l) => ({ id: l.id, order: l.order, title: l.title }))}
        selectedIds={form.lessonIds}
        onChange={(lessonIds) => onPatch({ lessonIds })}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => onPatch({ published: e.target.checked })}
        />
        Сразу опубликовать событие
      </label>
    </>
  );
}

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
  // type="button" обязателен — иначе drag в форме редактирования урока триггерит submit
  return (
    <Card ref={setNodeRef} style={style} className="group cursor-pointer">
      <CardContent
        className="flex flex-col gap-2 p-3"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-stop-lesson-card-click]")) return;
          onEdit();
        }}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            data-stop-lesson-card-click
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none shrink-0 active:cursor-grabbing"
            aria-label="Перетащить"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          <span className="w-8 shrink-0 pt-0.5 text-sm text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium leading-snug">{lesson.title}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={lesson.published ? "success" : "outline"} className="text-xs">
              {lesson.published ? "Опубл." : "Черн."}
            </Badge>
            {lesson._count.submissions > 0 && (
              <Badge variant="secondary" className="text-xs">
                {lesson._count.submissions} ДЗ
              </Badge>
            )}
          </div>
        </div>
        <div
          data-stop-lesson-card-click
          className="flex justify-end gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePublish();
            }}
            aria-label={lesson.published ? "Снять с публикации" : "Опубликовать"}
          >
            {lesson.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Редактировать урок"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive hover:text-destructive"
            aria-label="Удалить урок"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
  onUpdate: (updates: Partial<Omit<ContentBlock, "id">>) => void;
  onRemove: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingPages, setGeneratingPages] = useState(false);
  const [pagesProgress, setPagesProgress] = useState<{ done: number; total: number } | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  async function generatePdfPages(pdfUrl: string) {
    setGeneratingPages(true);
    setPagesProgress(null);
    try {
      const pdfjs = await loadPdfJs();
      const proxiedUrl = `/api/pdf?src=${encodeURIComponent(pdfUrl)}`;
      const doc = await pdfjs.getDocument({ url: proxiedUrl, withCredentials: true }).promise;

      const total = doc.numPages;
      setPagesProgress({ done: 0, total });
      const pageUrls: string[] = [];

      // ограничение, чтобы не убивать мобилку/браузер
      const maxPages = 60;
      const renderTotal = Math.min(total, maxPages);

      for (let i = 1; i <= renderTotal; i++) {
        const page = await doc.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        // целимся в ~900px ширины: заметно быстрее на телефонах, вес страниц меньше
        const targetWidth = 900;
        const scale = Math.max(0.1, targetWidth / v1.width);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas ctx missing");

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/webp",
              0.75
          );
        });

        const fileName = `page-${String(i).padStart(3, "0")}-${crypto.randomUUID()}.webp`;
        const presignRes = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            contentType: "image/webp",
            size: blob.size,
            path: "documents/pdf-pages",
          }),
        });
        if (!presignRes.ok) throw new Error("presign failed");
        const { url, key } = await presignRes.json();
        await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/webp" } });
        pageUrls.push(getPublicUrl(key));

        setPagesProgress({ done: i, total: renderTotal });
      }

      onUpdate({ pages: pageUrls });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка генерации страниц PDF");
    } finally {
      setGeneratingPages(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const autoPrefix =
      file.type === "application/pdf"
        ? "documents"
        : file.type.startsWith("video/")
          ? "videos"
          : "images";
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
      const uploadedUrl = getPublicUrl(key);
      onUpdate({ content: uploadedUrl, pages: undefined });
      if (block.type === "pdf") {
        // Автогенерация для ускорения ученика (можно отменить кнопкой Убрать)
        void generatePdfPages(uploadedUrl);
      }
    } catch { /* silent */ }
    setUploading(false);
    e.target.value = "";
  }

  function applyUrl() {
    const val = urlRef.current?.value?.trim();
    if (val) onUpdate({ content: val });
  }

  const typeLabel = block.type === "video" ? "Видео" : block.type === "pdf" ? "PDF" : "Изображение";
  const TypeIcon = block.type === "video" ? Film : block.type === "pdf" ? FileText : ImageIcon;
  const iconColor =
    block.type === "video" ? "text-primary" : block.type === "pdf" ? "text-orange-500" : "text-blue-500";

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
            <div className="space-y-2">
              <div className="rounded-lg overflow-hidden border bg-muted max-h-48">
                <Image
                  src={block.content}
                  alt="Превью изображения"
                  width={960}
                  height={540}
                  className="h-auto max-h-48 w-full object-contain"
                  unoptimized
                />
              </div>
              {/* Выбор размера отображения у студента */}
              <div className="min-w-0 space-y-1.5">
                <span className="text-xs text-muted-foreground">Размер у студента</span>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["full", "half", "third"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={(block.size ?? "full") === s ? "default" : "outline"}
                      size="sm"
                      className="h-8 min-w-0 shrink px-2 text-xs"
                      onClick={() => onUpdate({ size: s })}
                    >
                      {s === "full" ? "Полная" : s === "half" ? "½ ширины" : "⅓ ширины"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {block.type === "video" && (
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/50 p-2">
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <video
                    src={block.content}
                    preload="metadata"
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = 0.1;
                    }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 pt-1">
                  <Film className="h-4 w-4 shrink-0 text-primary" />
                  <span className="break-all text-xs">{block.content.split("/").pop()}</span>
                </div>
              </div>
              <video
                src={block.content}
                controls
                playsInline
                className="aspect-video max-h-[min(50vh,420px)] w-full rounded-lg border bg-black"
              />
            </div>
          )}
          {block.type === "pdf" && (
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <FileText className="h-4 w-4 shrink-0 text-orange-500" />
                <a
                  href={block.content}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-xs text-primary hover:underline"
                  title={block.content}
                >
                  {block.content.split("/").pop()}
                </a>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={generatingPages}
                  onClick={() => void generatePdfPages(block.content)}
                >
                  {generatingPages
                    ? pagesProgress
                      ? `Генерим ${pagesProgress.done}/${pagesProgress.total}…`
                      : "Генерим…"
                    : "Сгенерировать страницы"}
                </Button>
              </div>
              {block.pages && block.pages.length > 0 ? (
                <div className="space-y-3">
                  {block.pages.map((p, idx) => (
                    <div key={p} className="overflow-hidden rounded-lg border bg-background">
                      <Image
                        src={p}
                        alt={`PDF page ${idx + 1}`}
                        width={1200}
                        height={1700}
                        className="block h-auto w-full"
                        loading="lazy"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Страницы ещё не сгенерированы. Нажми «Сгенерировать страницы» — ученикам будет открываться быстро.
                </div>
              )}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate({ content: "" })}>
            <X className="h-3 w-3 mr-1" /> Убрать
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              ref={urlRef}
              placeholder={block.type === "video" ? "URL видео" : block.type === "pdf" ? "URL PDF" : "URL изображения"}
              onBlur={applyUrl}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyUrl())}
              className="min-w-0 sm:min-w-[180px] sm:flex-1"
            />
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPicker(!showPicker)}>
                <Film className="mr-1 h-3.5 w-3.5" /> Хранилище
              </Button>
              <div className="relative shrink-0">
                <input
                  type="file"
                  accept={block.type === "video" ? "video/*" : block.type === "pdf" ? "application/pdf" : "image/*"}
                  onChange={handleUpload}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  disabled={uploading}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploading}>
                  {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                  {uploading ? "..." : "Загрузить"}
                </Button>
              </div>
            </div>
          </div>

          {showPicker && (
            <Card className="min-w-0 w-full border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {block.type === "video" ? "Выберите видео" : block.type === "pdf" ? "Выберите PDF" : "Выберите изображение"}
                  </CardTitle>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setShowPicker(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-w-0">
                <AssetManager
                  onSelect={(url) => { onUpdate({ content: url }); setShowPicker(false); }}
                  defaultFilter={block.type === "video" ? "video" : block.type === "pdf" ? "document" : "image"}
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
  onUpdate: (updates: Partial<Omit<ContentBlock, "id">>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="min-w-0 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 gap-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none mt-1 shrink-0">
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
                onChange={(e) => onUpdate({ content: e.target.value })}
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
  marathonEvents: initialMarathonEvents,
  activeTab,
}: {
  product: SerializedProduct;
  lessons: SerializedLesson[];
  marathonEvents: SerializedMarathonEvent[];
  activeTab: string;
}) {
  // landingBlocks передаётся через product
  const router = useRouter();
  const returnToScrollYRef = useRef<number | null>(null);
  const [lessons, setLessons] = useState(initialLessons);
  const [marathonEvents, setMarathonEvents] = useState(initialMarathonEvents);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLessons(initialLessons);
  }, [initialLessons]);

  useEffect(() => {
    setMarathonEvents(initialMarathonEvents);
  }, [initialMarathonEvents]);

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
    rules: product.rules ?? "",
    coverUrl: product.coverUrl ?? "",
    price: product.price ? String(product.price) : "",
    paymentFormUrl: product.paymentFormUrl ?? "",
    startDate: toDateInputValue(product.startDate),
    durationDays: product.durationDays ? String(product.durationDays) : "",
  });
  const [marathonEventForm, setMarathonEventForm] = useState<MarathonEventForm>(getEmptyMarathonEventForm);
  const [marathonEditOpen, setMarathonEditOpen] = useState(false);
  const [marathonEditEventId, setMarathonEditEventId] = useState<string | null>(null);
  const [marathonEditForm, setMarathonEditForm] = useState<MarathonEventForm>(getEmptyMarathonEventForm);
  const [marathonSaving, setMarathonSaving] = useState(false);
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
      rules: product.rules ?? "",
      coverUrl: product.coverUrl ?? "",
      price: product.price ? String(product.price) : "",
      paymentFormUrl: product.paymentFormUrl ?? "",
      startDate: toDateInputValue(product.startDate),
      durationDays: product.durationDays ? String(product.durationDays) : "",
    });
  }, [product.id, product.title, product.description, product.rules, product.coverUrl, product.price, product.paymentFormUrl, product.startDate, product.durationDays]);

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
        rules: productForm.rules.trim() || undefined,
        coverUrl: productForm.coverUrl.trim() || undefined,
        price: productForm.price.trim() ? Number(productForm.price.trim()) : undefined,
        currency: product.currency,
        paymentFormUrl: productForm.paymentFormUrl.trim() || undefined,
        published: !product.published,
        startDate: product.type === "MARATHON" ? productForm.startDate || undefined : undefined,
        durationDays: product.type === "MARATHON" ? Number(productForm.durationDays) || undefined : undefined,
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
      const rules = productForm.rules.trim();
      const coverUrl = productForm.coverUrl.trim();
      const priceNum = productForm.price.trim() ? Number(productForm.price.trim()) : undefined;
      const startDate = productForm.startDate.trim();
      const durationDays = productForm.durationDays.trim() ? Number(productForm.durationDays.trim()) : undefined;

      const result = await updateProduct(product.id, {
        title,
        type: product.type as "COURSE" | "MARATHON",
        description: description || undefined,
        rules: rules || undefined,
        coverUrl: coverUrl || undefined,
        price: Number.isFinite(priceNum as number) ? (priceNum as number) : undefined,
        currency: product.currency,
        paymentFormUrl: productForm.paymentFormUrl.trim() || undefined,
        published: product.published,
        startDate: product.type === "MARATHON" ? startDate || undefined : undefined,
        durationDays: product.type === "MARATHON" && Number.isFinite(durationDays as number) ? (durationDays as number) : undefined,
      });

      if ("error" in result && result.error) {
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

  async function handleCreateMarathonEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (marathonSaving) return;

    try {
      setMarathonSaving(true);
      setError("");
      setSuccessMsg("");

      const payload = {
        title: marathonEventForm.title,
        description: marathonEventForm.description || undefined,
        type: marathonEventForm.type,
        track: marathonEventForm.track,
        dayOffset: Number(marathonEventForm.dayOffset),
        weekNumber:
          marathonEventForm.weekNumber.trim() === "" ? undefined : Number(marathonEventForm.weekNumber),
        lessonIds: marathonEventForm.lessonIds,
        published: marathonEventForm.published,
      };
      const result = await createMarathonEvent(product.id, payload);

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setMarathonEventForm(getEmptyMarathonEventForm());
      setSuccessMsg("Событие марафона добавлено");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleCreateMarathonEvent]", err);
      setError("Ошибка при создании события марафона");
    } finally {
      setMarathonSaving(false);
    }
  }

  function openMarathonEditModal(event: SerializedMarathonEvent) {
    setMarathonEditEventId(event.id);
    setMarathonEditForm({
      title: event.title,
      description: event.description ?? "",
      type: event.type,
      track: event.track,
      dayOffset: String(event.dayOffset),
      weekNumber: event.weekNumber != null ? String(event.weekNumber) : "",
      lessonIds: [...event.lessonIds],
      published: event.published,
    });
    setMarathonEditOpen(true);
  }

  function closeMarathonEditModal() {
    setMarathonEditOpen(false);
    setMarathonEditEventId(null);
    setMarathonEditForm(getEmptyMarathonEventForm());
  }

  async function handleSaveMarathonEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (marathonSaving || !marathonEditEventId) return;

    try {
      setMarathonSaving(true);
      setError("");
      setSuccessMsg("");

      const payload = {
        title: marathonEditForm.title,
        description: marathonEditForm.description || undefined,
        type: marathonEditForm.type,
        track: marathonEditForm.track,
        dayOffset: Number(marathonEditForm.dayOffset),
        weekNumber:
          marathonEditForm.weekNumber.trim() === "" ? undefined : Number(marathonEditForm.weekNumber),
        lessonIds: marathonEditForm.lessonIds,
        published: marathonEditForm.published,
      };
      const result = await updateMarathonEvent(marathonEditEventId, payload);

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      closeMarathonEditModal();
      setSuccessMsg("Событие марафона обновлено");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleSaveMarathonEdit]", err);
      setError("Ошибка при обновлении события марафона");
    } finally {
      setMarathonSaving(false);
    }
  }

  async function handleDeleteMarathonEvent(eventId: string, eventTitle: string) {
    if (marathonSaving) return;
    if (!confirmDeletion(`Удалить событие марафона «${eventTitle}»? Действие нельзя отменить.`)) return;

    try {
      setMarathonSaving(true);
      setError("");
      setSuccessMsg("");

      const result = await deleteMarathonEvent(eventId);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (marathonEditEventId === eventId) {
        closeMarathonEditModal();
      }
      setSuccessMsg("Событие марафона удалено");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleDeleteMarathonEvent]", err);
      setError("Ошибка при удалении события марафона");
    } finally {
      setMarathonSaving(false);
    }
  }

  async function handleMoveMarathonEvent(
    currentDayEvents: SerializedMarathonEvent[],
    eventId: string,
    direction: "up" | "down"
  ) {
    if (marathonSaving) return;

    const currentIndex = currentDayEvents.findIndex((event) => event.id === eventId);
    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentDayEvents.length) return;

    const reordered = arrayMove(currentDayEvents, currentIndex, targetIndex).map((event, index) => ({
      id: event.id,
      dayOffset: event.dayOffset,
      position: index,
    }));

    try {
      setMarathonSaving(true);
      setError("");
      setSuccessMsg("");

      const result = await reorderMarathonEvents(product.id, reordered);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMsg("Порядок событий обновлён");
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      console.error("[handleMoveMarathonEvent]", err);
      setError("Ошибка при изменении порядка событий");
    } finally {
      setMarathonSaving(false);
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

  async function handleDeleteLesson(lessonId: string, lessonTitle: string) {
    if (!confirmDeletion(`Удалить урок «${lessonTitle}»? Действие нельзя отменить.`)) return;
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

  function updateBlock(id: string, updates: Partial<Omit<ContentBlock, "id">>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }

  function removeBlock(id: string) {
    if (!confirmDeletion("Удалить этот блок контента? Изменения вступят в силу после сохранения урока.")) return;
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

      const y = returnToScrollYRef.current;
      if (y != null) {
        returnToScrollYRef.current = null;
        requestAnimationFrame(() => {
          window.scrollTo({ top: y });
          // на случай, если refresh перерисует позже
          setTimeout(() => window.scrollTo({ top: y }), 50);
        });
      }
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
    returnToScrollYRef.current = window.scrollY;
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

  function scrollToMarathonEventsList() {
    const container = document.getElementById("marathon-events-list");
    if (!container) return;
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const marathonEventsByDay = marathonEvents.reduce<Record<number, SerializedMarathonEvent[]>>((acc, event) => {
    if (!acc[event.dayOffset]) {
      acc[event.dayOffset] = [];
    }

    acc[event.dayOffset].push(event);
    return acc;
  }, {});

  const sortedMarathonDays = Object.keys(marathonEventsByDay)
    .map((key) => Number(key))
    .sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>}
      {successMsg && <div className="bg-green-500/10 text-green-700 dark:text-green-400 text-sm p-3 rounded-lg">{successMsg}</div>}

      {/* === ОПИСАНИЕ === */}
      <div className={activeTab !== "description" ? "hidden" : undefined}>
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
                      <Image
                        src={productForm.coverUrl}
                        alt="Обложка курса"
                        width={1280}
                        height={720}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
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
                      <Card className="min-w-0 w-full border-primary/30">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Выберите обложку</CardTitle>
                            <Button type="button" variant="ghost" size="icon" onClick={() => setShowCoverPicker(false)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="min-w-0">
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
                      <Card className="min-w-0 w-full border-primary/30">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Выберите обложку</CardTitle>
                            <Button type="button" variant="ghost" size="icon" onClick={() => setShowCoverPicker(false)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="min-w-0">
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

            <div className="space-y-2">
              <label className={tokens.typography.label}>Ссылка на форму оплаты</label>
              <Input
                value={productForm.paymentFormUrl}
                onChange={(e) => setProductForm((p) => ({ ...p, paymentFormUrl: e.target.value }))}
                placeholder="https://forms.yandex.ru/…"
                className="font-mono text-sm"
              />
              <p className={tokens.typography.small}>
                Нужна при публикации платного курса, если на сервере не задан <code className="rounded bg-muted px-1">YOOMONEY_WALLET_RECEIVER</code>{" "}
                (прямая оплата через ЮMoney). Для сценария только с формой: в URL добавится{" "}
                <code className="rounded bg-muted px-1">paymentRef</code> — в JSON-вебхук формы передайте как{" "}
                <code className="rounded bg-muted px-1">reference</code>.
              </p>
            </div>

            {product.type === "MARATHON" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className={tokens.typography.label}>Дата старта марафона</label>
                  <Input
                    type="date"
                    value={productForm.startDate}
                    onChange={(e) => setProductForm((p) => ({ ...p, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className={tokens.typography.label}>Длительность марафона (дней)</label>
                  <Input
                    type="number"
                    min="1"
                    value={productForm.durationDays}
                    onChange={(e) => setProductForm((p) => ({ ...p, durationDays: e.target.value }))}
                    placeholder="21"
                    required
                  />
                </div>
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
            </div>
          </form>
        </CardContent>
      </Card>

      </div>

      {/* === ПРАВИЛА === */}
      <div className={activeTab !== "rules" ? "hidden" : undefined}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Правила</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={tokens.typography.small}>
            Правила отображаются у студента в разделе «Правила» (левое меню). Если поле пустое — раздел не показывается.
            Поддерживается форматирование: <strong>жирный</strong>, <em>курсив</em>, списки, заголовки, эмодзи.
          </p>
          <RichTextEditor
            value={productForm.rules}
            onChange={(val) => setProductForm((p) => ({ ...p, rules: val }))}
            placeholder="Опишите правила марафона: режим дня, питание, запреты, рекомендации..."
            minHeight="160px"
          />
          <Button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const result = await updateProduct(product.id, {
                title: productForm.title.trim(),
                type: product.type as "COURSE" | "MARATHON",
                description: productForm.description.trim() || undefined,
                rules: productForm.rules.trim() || undefined,
                coverUrl: productForm.coverUrl.trim() || undefined,
                price: productForm.price.trim() ? Number(productForm.price.trim()) : undefined,
                currency: product.currency,
                paymentFormUrl: productForm.paymentFormUrl.trim() || undefined,
                published: product.published,
                startDate: product.type === "MARATHON" ? productForm.startDate || undefined : undefined,
                durationDays: product.type === "MARATHON" && productForm.durationDays.trim() ? Number(productForm.durationDays.trim()) : undefined,
              });
              setSaving(false);
              if (result.error) setError(result.error);
              else { setSuccessMsg("Правила сохранены"); setTimeout(() => setSuccessMsg(""), 3000); router.refresh(); }
            }}
          >
            {saving ? "Сохраняем..." : "Сохранить правила"}
          </Button>
        </CardContent>
      </Card>

      </div>

      {/* === РАСПИСАНИЕ === */}
      <div className={activeTab !== "schedule" ? "hidden" : undefined}>
      {product.type === "MARATHON" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Расписание марафона
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleCreateMarathonEvent} className="space-y-4 rounded-lg border p-4">
              <div className="md:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={scrollToMarathonEventsList}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  К списку событий
                </Button>
              </div>
              <div>
                <p className="font-medium text-sm">Новое событие</p>
                <p className="text-xs text-muted-foreground">
                  Можно привязать событие к уроку или использовать его как календарный элемент. Редактирование — кнопка
                  «Изменить» у события в списке ниже (открывается в отдельном окне).
                </p>
              </div>

              <MarathonEventFields
                form={marathonEventForm}
                onPatch={(patch) => setMarathonEventForm((prev) => ({ ...prev, ...patch }))}
                lessons={lessons}
              />

              <div className="flex gap-3">
                <Button type="submit" disabled={marathonSaving}>
                  {marathonSaving ? "Сохраняем..." : "Добавить событие"}
                </Button>
              </div>
            </form>

            <Dialog open={marathonEditOpen} onOpenChange={(open) => !open && closeMarathonEditModal()}>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Редактирование события</DialogTitle>
                  <DialogDescription>
                    Изменения сохраняются для выбранного дня и сразу видны студентам, если событие опубликовано.
                  </DialogDescription>
                </DialogHeader>
                <form id="marathon-edit-form" onSubmit={handleSaveMarathonEdit} className="space-y-4">
                  <MarathonEventFields
                    form={marathonEditForm}
                    onPatch={(patch) => setMarathonEditForm((prev) => ({ ...prev, ...patch }))}
                    lessons={lessons}
                  />
                </form>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={closeMarathonEditModal} disabled={marathonSaving}>
                    Отмена
                  </Button>
                  <Button type="submit" form="marathon-edit-form" disabled={marathonSaving}>
                    {marathonSaving ? "Сохраняем..." : "Сохранить"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div id="marathon-events-list" className="space-y-4">
              {sortedMarathonDays.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Пока нет событий марафона. Добавьте первый день или подготовительный этап.
                </div>
              ) : (
                sortedMarathonDays.map((day) => (
                  <div key={day} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">День {day}</p>
                        <p className="text-xs text-muted-foreground">
                          {marathonEventsByDay[day]?.length ?? 0} событий
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {marathonEventsByDay[day]?.map((event, eventIndex) => {
                        const linkedLessons = event.lessonIds
                          .map((id) => lessons.find((item) => item.id === id))
                          .filter((l): l is SerializedLesson => Boolean(l));
                        const dayEvents = marathonEventsByDay[day] ?? [];

                        return (
                          <div
                            key={event.id}
                            className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 md:flex-row md:items-start md:justify-between"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">{event.title}</span>
                                <Badge variant="outline" className="text-xs">{event.type}</Badge>
                                <Badge variant="secondary" className="text-xs">{event.track}</Badge>
                                <Badge variant={event.published ? "success" : "outline"} className="text-xs">
                                  {event.published ? "Опубликовано" : "Черновик"}
                                </Badge>
                                {event.weekNumber != null && (
                                  <Badge variant="outline" className="text-xs">
                                    {event.weekNumber === 0 ? "Подготовка" : `Неделя ${event.weekNumber}`}
                                  </Badge>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                              {linkedLessons.length > 0 && (
                                <ul className="list-inside list-disc text-xs text-muted-foreground">
                                  {linkedLessons.map((l) => (
                                    <li key={l.id}>
                                      Урок {l.order}. {l.title}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={marathonSaving || eventIndex === 0}
                                onClick={() => handleMoveMarathonEvent(dayEvents, event.id, "up")}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={marathonSaving || eventIndex === dayEvents.length - 1}
                                onClick={() => handleMoveMarathonEvent(dayEvents, event.id, "down")}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={marathonSaving}
                                onClick={() => openMarathonEditModal(event)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Изменить
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={marathonSaving}
                                onClick={() => handleDeleteMarathonEvent(event.id, event.title)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Удалить
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      </div>{/* /расписание hidden */}

      {/* === ЛЕНДИНГ === */}
      <div className={activeTab !== "landing" ? "hidden" : undefined}>
        <LandingEditor productId={product.id} productSlug={product.slug} initialBlocks={product.landingBlocks} />
      </div>

      {/* === УРОКИ === */}
      <div className={activeTab !== "lessons" ? "hidden" : undefined}>

      {/* Форма создания/редактирования урока */}
      {(showNewLesson || editingLesson) && (
        <Card>
          <CardHeader>
            <div className="space-y-2">
              <div className="md:hidden">
                <Button type="button" variant="outline" size="sm" className="w-full justify-center" onClick={resetForm}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  К списку уроков
                </Button>
              </div>
              <CardTitle className="text-base">
                {editingLesson ? `Редактирование: ${editingLesson.title}` : "Новый урок"}
              </CardTitle>
            </div>
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
                            onUpdate={(updates) => updateBlock(block.id, updates)}
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
                    <Film className="h-3.5 w-3.5 mr-1.5 text-primary" /> + Видео
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("image")}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5 text-blue-500" /> + Изображение
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("pdf")}>
                    <FileText className="h-3.5 w-3.5 mr-1.5 text-orange-500" /> + PDF
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={tokens.typography.h4}>Уроки ({lessons.length})</h2>
          <Button type="button" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Создать урок
          </Button>
        </div>
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
                  onDelete={() => handleDeleteLesson(lesson.id, lesson.title)}
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
                    <p className="break-words text-sm font-medium leading-snug">{lesson.title}</p>
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
      </div>{/* /уроки hidden */}
    </div>
  );
}
