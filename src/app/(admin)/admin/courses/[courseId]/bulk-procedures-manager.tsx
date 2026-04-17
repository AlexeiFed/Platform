/**
 * bulk-procedures-manager.tsx
 * Компонент массового управления процедурами марафона.
 * Позволяет выбрать всех или отдельных участников и назначить процедуру сразу всем.
 * Используется в вкладке "Процедуры" редактора марафона.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, Loader2, CheckCircle2, Circle, Trash2 } from "lucide-react";
import {
  getProductEnrollmentsForProcedures,
  getAllProcedureTypes,
  assignProcedureBulk,
  createProcedureType,
  deleteProcedureType,
  deleteUserProcedure,
} from "./marathon-actions";

// === Types ===

type ProcedureTypeOption = { id: string; title: string };

type EnrollmentRow = {
  id: string;
  user: { id: string; name: string | null; email: string };
  procedureCount: number;
  completedCount: number;
  procedures: {
    id: string;
    scheduledAt: string | null;
    completedAt: string | null;
    notes: string | null;
    procedureType: ProcedureTypeOption;
  }[];
};

type Props = { productId: string };

// === Component ===

export function BulkProceduresManager({ productId }: Props) {
  const router = useRouter();

  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [procedureTypes, setProcedureTypes] = useState<ProcedureTypeOption[]>([]);
  /** Инкремент вызывает повторную загрузку данных */
  const [refreshKey, setRefreshKey] = useState(0);

  // Форма назначения
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [procedureTypeId, setProcedureTypeId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  // Новый тип процедуры
  const [newTypeTitle, setNewTypeTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Загружаем данные при монтировании и после refreshKey
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [enrollResult, typesResult] = await Promise.all([
        getProductEnrollmentsForProcedures(productId),
        getAllProcedureTypes(),
      ]);

      if (cancelled) return;

      if (enrollResult.success && enrollResult.data) {
        setEnrollments(enrollResult.data);
      }
      if (typesResult.success && typesResult.data) {
        setProcedureTypes(typesResult.data);
        // Выставляем первый тип по умолчанию только при первой загрузке
        setProcedureTypeId((prev) =>
          prev || typesResult.data?.[0]?.id || ""
        );
      }
      setLoadingData(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [productId, refreshKey]);

  // Выбор всех / сброс
  const allSelected = enrollments.length > 0 && selectedIds.size === enrollments.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(enrollments.map((e) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Массовое назначение
  async function handleBulkAssign() {
    if (saving || selectedIds.size === 0 || !procedureTypeId) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const result = await assignProcedureBulk({
      productId,
      enrollmentIds: Array.from(selectedIds),
      procedureTypeId,
      scheduledAt: scheduledAt || undefined,
      notes: notes || undefined,
    });

    if (result.error) {
      setError(result.error);
    } else if (result.success && result.data) {
      setSuccess(`Процедура назначена ${result.data.count} участникам`);
      setScheduledAt("");
      setNotes("");
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
      router.refresh();
    }
    setSaving(false);
  }

  // Удаление типа процедуры
  async function handleDeleteType(typeId: string) {
    if (deletingTypeId) return;
    setDeletingTypeId(typeId);
    setError("");
    const result = await deleteProcedureType(typeId);
    if (result.error) {
      setError(result.error);
    } else {
      setProcedureTypes((prev) => prev.filter((t) => t.id !== typeId));
      if (procedureTypeId === typeId) setProcedureTypeId("");
    }
    setDeletingTypeId(null);
  }

  // Удаление конкретной процедуры у студента
  async function handleDeleteProcedure(procedureId: string) {
    if (deletingId) return;
    setDeletingId(procedureId);
    setError("");
    const result = await deleteUserProcedure(procedureId);
    if (result.error) {
      setError(result.error);
    } else {
      setRefreshKey((k) => k + 1);
      router.refresh();
    }
    setDeletingId(null);
  }

  // Создание нового типа
  async function handleCreateType() {
    if (saving || !newTypeTitle.trim()) return;
    setSaving(true);
    setError("");
    const result = await createProcedureType({ title: newTypeTitle.trim() });
    if (result.error) {
      setError(result.error);
    } else if (result.success && result.data) {
      const added = result.data;
      setProcedureTypes((prev) => [...prev, added]);
      setProcedureTypeId(added.id);
      setNewTypeTitle("");
      setSuccess(`Тип "${added.title}" создан`);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* Flash messages */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      {/* Справочник типов */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Типы процедур</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {procedureTypes.length === 0 ? (
              <span className="text-sm text-muted-foreground">Типы ещё не созданы.</span>
            ) : (
              procedureTypes.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                  {t.title}
                  <button
                    type="button"
                    disabled={deletingTypeId === t.id}
                    onClick={() => void handleDeleteType(t.id)}
                    className="ml-0.5 rounded-full opacity-40 hover:opacity-100 disabled:opacity-20"
                    title="Удалить тип"
                  >
                    {deletingTypeId === t.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Название нового типа"
              value={newTypeTitle}
              onChange={(e) => setNewTypeTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void handleCreateType(); }
              }}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreateType()}
              disabled={saving || !newTypeTitle.trim()}
            >
              Создать тип
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Форма назначения */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Массовое назначение процедуры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Тип процедуры</label>
              <select
                value={procedureTypeId}
                onChange={(e) => setProcedureTypeId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Выберите тип</option>
                {procedureTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Запланировано</label>
              <Input
                type="date"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Заметка</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Комментарий"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void handleBulkAssign()}
            disabled={saving || selectedIds.size === 0 || !procedureTypeId}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <UserCheck className="mr-2 h-4 w-4" />
            Назначить выбранным ({selectedIds.size})
          </Button>
        </CardContent>
      </Card>

      {/* Список участников */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Участники марафона
            {!loadingData && <Badge variant="outline">{enrollments.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка участников...
            </div>
          ) : enrollments.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              В этом марафоне пока нет участников.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Выбрать всех */}
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 hover:bg-muted/50"
                onClick={toggleAll}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
                <span className="text-sm font-medium">
                  {allSelected ? "Снять всех" : `Выбрать всех (${enrollments.length})`}
                </span>
              </div>

              {/* Строки участников */}
              {enrollments.map((enrollment) => {
                const checked = selectedIds.has(enrollment.id);
                return (
                  <div
                    key={enrollment.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent/50 ${checked ? "border-primary/40 bg-primary/5" : ""}`}
                    onClick={() => toggleOne(enrollment.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(enrollment.id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {enrollment.user.name ?? enrollment.user.email}
                        </span>
                        {enrollment.user.name && (
                          <span className="text-xs text-muted-foreground">{enrollment.user.email}</span>
                        )}
                      </div>
                      {enrollment.procedureCount > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {enrollment.procedures.map((p) => (
                            <span
                              key={p.id}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                p.completedAt
                                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                                  : "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
                              }`}
                            >
                              {p.completedAt
                                ? <CheckCircle2 className="h-2.5 w-2.5" />
                                : <Circle className="h-2.5 w-2.5" />}
                              {p.procedureType.title}
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  void handleDeleteProcedure(p.id);
                                }}
                                className="ml-0.5 rounded-full opacity-60 hover:opacity-100 disabled:opacity-30"
                                title="Удалить процедуру"
                              >
                                {deletingId === p.id
                                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  : <Trash2 className="h-2.5 w-2.5" />}
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {enrollment.procedureCount > 0
                        ? `${enrollment.completedCount}/${enrollment.procedureCount} процедур`
                        : "Нет процедур"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
