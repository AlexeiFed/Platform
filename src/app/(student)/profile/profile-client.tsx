/**
 * profile-client.tsx
 * Клиентский компонент страницы профиля студента.
 * Разделы:
 *  - шапка: аватар (смена через S3), имя, email
 *  - вес / рост (автосохранение onBlur)
 *  - фото прогресса: 4 «до» сверху, 4 «после» снизу (grid-cols-4)
 *  - замеры: таблица с датами + форма добавления новой записи
 */
"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { getInitials } from "@/lib/utils";
import {
  Camera,
  Loader2,
  Plus,
  Trash2,
  X,
  ImagePlus,
} from "lucide-react";
import { useFeedbackUploader } from "@/components/shared/feedback-attachments";
import {
  updateProfileBasic,
  setProgressPhoto,
  removeProgressPhoto,
  addMeasurement,
  deleteMeasurement,
} from "./actions";

// === Types ===

type UserData = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  weight: number | null;
  height: number | null;
};

type ProgressPhoto = {
  id: string;
  type: "BEFORE" | "AFTER";
  position: number;
  url: string;
};

type Measurement = {
  id: string;
  date: string;
  shoulders: number | null;
  aboveChest: number | null;
  belowChest: number | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  thighRight: number | null;
  thighLeft: number | null;
  calfRight: number | null;
  calfLeft: number | null;
  armRight: number | null;
  armLeft: number | null;
};

type Props = {
  user: UserData;
  photos: ProgressPhoto[];
  measurements: Measurement[];
};

// Поля замеров: единый источник для формы/таблицы
const measureFields: { key: keyof Omit<Measurement, "id" | "date">; label: string }[] = [
  { key: "shoulders", label: "Плечи" },
  { key: "aboveChest", label: "Над грудью" },
  { key: "belowChest", label: "Под грудью" },
  { key: "waist", label: "Талия" },
  { key: "abdomen", label: "Живот" },
  { key: "hips", label: "Бёдра" },
  { key: "thighRight", label: "Бедро правое" },
  { key: "thighLeft", label: "Бедро левое" },
  { key: "calfRight", label: "Голень правая" },
  { key: "calfLeft", label: "Голень левая" },
  { key: "armRight", label: "Рука правая" },
  { key: "armLeft", label: "Рука левая" },
];

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

// === Component ===

export function ProfileClient({ user, photos, measurements }: Props) {
  return (
    <div className="space-y-6">
      <BasicCard user={user} />
      <PhotosCard photos={photos} />
      <MeasurementsCard measurements={measurements} />
    </div>
  );
}

// === Basic: avatar + name + weight/height ===

function BasicCard({ user }: { user: UserData }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [name, setName] = useState(user.name ?? "");
  const [weight, setWeight] = useState(user.weight != null ? String(user.weight) : "");
  const [height, setHeight] = useState(user.height != null ? String(user.height) : "");
  const [savingBasic, setSavingBasic] = useState(false);
  const { uploading, uploadFiles } = useFeedbackUploader("profile");

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const [uploaded] = await uploadFiles([file]);
    if (!uploaded) return;
    setAvatarUrl(uploaded.url);
    await updateProfileBasic({ avatarUrl: uploaded.url });
  }

  async function saveNumber(field: "weight" | "height", raw: string) {
    const num = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (num !== null && (!Number.isFinite(num) || num <= 0)) return;
    setSavingBasic(true);
    await updateProfileBasic({ [field]: num } as { weight?: number | null; height?: number | null });
    setSavingBasic(false);
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingBasic(true);
    await updateProfileBasic({ name: trimmed });
    setSavingBasic(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Основные данные</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
          {/* Аватар */}
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="text-2xl">{getInitials(name || user.email)}</AvatarFallback>
            </Avatar>
            <label
              className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              aria-label="Сменить аватар"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarChange}
              />
            </label>
          </div>

          {/* Имя + email */}
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <label className={tokens.typography.label}>Имя</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                placeholder="Как к вам обращаться"
              />
            </div>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        {/* Вес / рост */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={tokens.typography.label}>Вес (кг)</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => saveNumber("weight", weight)}
              placeholder="например, 65.5"
            />
          </div>
          <div className="space-y-1">
            <label className={tokens.typography.label}>Рост (см)</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              onBlur={() => saveNumber("height", height)}
              placeholder="например, 170"
            />
          </div>
        </div>
        {savingBasic && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> сохраняем…
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// === Photos: 4 before на верхнем ряду, 4 after под ними ===

function PhotosCard({ photos }: { photos: ProgressPhoto[] }) {
  const [items, setItems] = useState<ProgressPhoto[]>(photos);
  const { uploading, uploadFiles } = useFeedbackUploader("profile");
  const [loadingSlot, setLoadingSlot] = useState<string | null>(null);

  function findAt(type: "BEFORE" | "AFTER", position: number) {
    return items.find((p) => p.type === type && p.position === position) ?? null;
  }

  async function onSlotChange(e: React.ChangeEvent<HTMLInputElement>, type: "BEFORE" | "AFTER", position: number) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const slotKey = `${type}-${position}`;
    setLoadingSlot(slotKey);
    const [uploaded] = await uploadFiles([file]);
    if (!uploaded) {
      setLoadingSlot(null);
      return;
    }
    const res = await setProgressPhoto({ type, position, url: uploaded.url });
    setLoadingSlot(null);
    if (res.success) {
      setItems((prev) => {
        const without = prev.filter((p) => !(p.type === type && p.position === position));
        return [
          ...without,
          {
            id: `local-${type}-${position}-${Date.now()}`,
            type,
            position,
            url: uploaded.url,
          },
        ];
      });
    }
  }

  async function onRemove(photo: ProgressPhoto) {
    // Оптимистичное удаление
    setItems((prev) => prev.filter((p) => p.id !== photo.id));
    const res = await removeProgressPhoto(photo.id);
    if (!res.success) {
      // Откатываем
      setItems((prev) => [...prev, photo]);
    }
  }

  function renderRow(type: "BEFORE" | "AFTER") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, pos) => {
          const p = findAt(type, pos);
          const slotKey = `${type}-${pos}`;
          const isLoading = uploading && loadingSlot === slotKey;
          return (
            <div
              key={slotKey}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {p ? (
                <>
                  <Image
                    src={p.url}
                    alt={`${type === "BEFORE" ? "До" : "После"} ${pos + 1}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Удалить фото"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-accent/40">
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span>Загрузить</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onSlotChange(e, type, pos)}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Фото прогресса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className={tokens.typography.label}>До</p>
          {renderRow("BEFORE")}
        </div>
        <div className="space-y-2">
          <p className={tokens.typography.label}>После</p>
          {renderRow("AFTER")}
        </div>
      </CardContent>
    </Card>
  );
}

// === Measurements ===

type MeasureForm = Record<(typeof measureFields)[number]["key"], string> & { date: string };

function emptyForm(): MeasureForm {
  const today = new Date().toISOString().slice(0, 10);
  const base = { date: today } as MeasureForm;
  for (const f of measureFields) base[f.key] = "";
  return base;
}

function MeasurementsCard({ measurements }: { measurements: Measurement[] }) {
  const [items, setItems] = useState<Measurement[]>(measurements);
  const [form, setForm] = useState<MeasureForm>(emptyForm());
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const numeric: Record<string, number | null> = {};
    for (const f of measureFields) {
      const raw = form[f.key].trim();
      if (raw === "") {
        numeric[f.key] = null;
        continue;
      }
      const num = Number(raw.replace(",", "."));
      if (!Number.isFinite(num) || num < 0) {
        setError(`Некорректное значение: ${f.label}`);
        return;
      }
      numeric[f.key] = num;
    }

    start(async () => {
      const res = await addMeasurement({
        date: form.date,
        ...numeric,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      // Оптимистично добавляем в список
      const newItem: Measurement = {
        id: `local-${Date.now()}`,
        date: new Date(form.date).toISOString(),
        shoulders: numeric.shoulders ?? null,
        aboveChest: numeric.aboveChest ?? null,
        belowChest: numeric.belowChest ?? null,
        waist: numeric.waist ?? null,
        abdomen: numeric.abdomen ?? null,
        hips: numeric.hips ?? null,
        thighRight: numeric.thighRight ?? null,
        thighLeft: numeric.thighLeft ?? null,
        calfRight: numeric.calfRight ?? null,
        calfLeft: numeric.calfLeft ?? null,
        armRight: numeric.armRight ?? null,
        armLeft: numeric.armLeft ?? null,
      };
      setItems((prev) => [newItem, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setForm(emptyForm());
      setOpen(false);
    });
  }

  async function onDelete(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
    await deleteMeasurement(id);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Замеры</CardTitle>
        <Button size="sm" type="button" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> {open ? "Скрыть форму" : "Добавить"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-1">
                <label className={tokens.typography.label}>Дата</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
              {measureFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className={tokens.typography.label}>{f.label} (см)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form[f.key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} size="sm">
                {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Сохранить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setForm(emptyForm());
                  setOpen(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Замеров пока нет. Добавьте первую запись.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 text-left font-medium">Дата</th>
                  {measureFields.map((f) => (
                    <th key={f.key} className="py-2 px-2 text-right font-medium whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="py-2 pr-3 whitespace-nowrap font-medium">
                      {dateFmt.format(new Date(m.date))}
                    </td>
                    {measureFields.map((f) => (
                      <td key={f.key} className="py-2 px-2 text-right tabular-nums">
                        {m[f.key] == null ? "—" : m[f.key]}
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(m.id)}
                        aria-label="Удалить замер"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
