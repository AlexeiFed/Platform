"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  assignProcedureToEnrollment,
  createProcedureType,
  deleteUserProcedure,
  updateUserProcedure,
} from "../../courses/[courseId]/marathon-actions";

type ProcedureTypeOption = {
  id: string;
  title: string;
};

type ProcedureItem = {
  id: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  position: number;
  procedureType: ProcedureTypeOption;
};

type EnrollmentItem = {
  id: string;
  createdAt: string;
  product: {
    id: string;
    title: string;
    slug: string;
    published: boolean;
    startDate: string | null;
    durationDays: number | null;
  };
  procedures: ProcedureItem[];
};

type ProcedureDraft = {
  procedureTypeId: string;
  scheduledAt: string;
  completedAt: string;
  notes: string;
};

type Props = {
  userId: string;
  enrollments: EnrollmentItem[];
  procedureTypes: ProcedureTypeOption[];
};

const toDateInputValue = (value: string | null) => {
  if (!value) return "";

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const MarathonProceduresManager = ({
  userId: _userId,
  enrollments,
  procedureTypes,
}: Props) => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [newProcedureTypeTitle, setNewProcedureTypeTitle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ProcedureDraft>>(() =>
    Object.fromEntries(
      enrollments.map((enrollment) => [
        enrollment.id,
        {
          procedureTypeId: procedureTypes[0]?.id ?? "",
          scheduledAt: "",
          completedAt: "",
          notes: "",
        },
      ])
    )
  );
  const [editDrafts, setEditDrafts] = useState<Record<string, ProcedureDraft>>(() =>
    Object.fromEntries(
      enrollments.flatMap((enrollment) =>
        enrollment.procedures.map((procedure) => [
          procedure.id,
          {
            procedureTypeId: procedure.procedureType.id,
            scheduledAt: toDateInputValue(procedure.scheduledAt),
            completedAt: toDateInputValue(procedure.completedAt),
            notes: procedure.notes ?? "",
          },
        ])
      )
    )
  );

  const setFlash = (nextError: string, nextSuccess = "") => {
    setError(nextError);
    setSuccess(nextSuccess);
  };

  const refreshPage = () => {
    router.refresh();
  };

  const handleCreateProcedureType = async () => {
    if (loading) return;

    try {
      setLoading(true);
      setFlash("");

      const result = await createProcedureType({
        title: newProcedureTypeTitle,
      });

      if (result.error) {
        setFlash(result.error);
        return;
      }

      setNewProcedureTypeTitle("");
      setFlash("", "Новый тип процедуры создан");
      refreshPage();
    } finally {
      setLoading(false);
    }
  };

  const handleAssignProcedure = async (enrollmentId: string) => {
    if (loading) return;

    try {
      setLoading(true);
      setFlash("");

      const draft = drafts[enrollmentId];
      const result = await assignProcedureToEnrollment({
        enrollmentId,
        procedureTypeId: draft?.procedureTypeId ?? "",
        scheduledAt: draft?.scheduledAt || undefined,
        completedAt: draft?.completedAt || undefined,
        notes: draft?.notes || undefined,
      });

      if (result.error) {
        setFlash(result.error);
        return;
      }

      setDrafts((prev) => ({
        ...prev,
        [enrollmentId]: {
          ...prev[enrollmentId],
          scheduledAt: "",
          completedAt: "",
          notes: "",
        },
      }));
      setFlash("", "Процедура назначена");
      refreshPage();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProcedure = async (procedureId: string) => {
    if (loading) return;

    try {
      setLoading(true);
      setFlash("");

      const draft = editDrafts[procedureId];
      const result = await updateUserProcedure(procedureId, {
        procedureTypeId: draft?.procedureTypeId,
        scheduledAt: draft?.scheduledAt || null,
        completedAt: draft?.completedAt || null,
        notes: draft?.notes || null,
      });

      if (result.error) {
        setFlash(result.error);
        return;
      }

      setFlash("", "Процедура обновлена");
      refreshPage();
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProcedure = async (procedureId: string) => {
    if (loading) return;

    try {
      setLoading(true);
      setFlash("");

      const result = await deleteUserProcedure(procedureId);
      if (result.error) {
        setFlash(result.error);
        return;
      }

      setFlash("", "Процедура удалена");
      refreshPage();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Справочник процедур</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {procedureTypes.length === 0 ? (
              <span className="text-sm text-muted-foreground">Типы процедур ещё не созданы.</span>
            ) : (
              procedureTypes.map((procedureType) => (
                <Badge key={procedureType.id} variant="outline">
                  {procedureType.title}
                </Badge>
              ))
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={newProcedureTypeTitle}
              onChange={(e) => setNewProcedureTypeTitle(e.target.value)}
              placeholder="Например, LPG-массаж"
            />
            <Button type="button" onClick={handleCreateProcedureType} disabled={loading}>
              Создать тип
            </Button>
          </div>
        </CardContent>
      </Card>

      {enrollments.map((enrollment) => {
        const assignedCount = enrollment.procedures.length;
        const completedCount = enrollment.procedures.filter((procedure) => procedure.completedAt).length;
        const draft = drafts[enrollment.id];

        return (
          <Card key={enrollment.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span>{enrollment.product.title}</span>
                <Badge variant="secondary">Марафон</Badge>
                <Badge variant={enrollment.product.published ? "success" : "outline"}>
                  {enrollment.product.published ? "Опубликован" : "Черновик"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Назначено {assignedCount} процедур, завершено {completedCount}
              </div>

              <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Тип процедуры</label>
                  <select
                    value={draft?.procedureTypeId ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [enrollment.id]: {
                          ...prev[enrollment.id],
                          procedureTypeId: e.target.value,
                        },
                      }))
                    }
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Выберите тип</option>
                    {procedureTypes.map((procedureType) => (
                      <option key={procedureType.id} value={procedureType.id}>
                        {procedureType.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Запланировано</label>
                  <Input
                    type="date"
                    value={draft?.scheduledAt ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [enrollment.id]: {
                          ...prev[enrollment.id],
                          scheduledAt: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выполнено</label>
                  <Input
                    type="date"
                    value={draft?.completedAt ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [enrollment.id]: {
                          ...prev[enrollment.id],
                          completedAt: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Заметка</label>
                  <Input
                    value={draft?.notes ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [enrollment.id]: {
                          ...prev[enrollment.id],
                          notes: e.target.value,
                        },
                      }))
                    }
                    placeholder="Комментарий"
                  />
                </div>
                <div className="md:col-span-4">
                  <Button
                    type="button"
                    onClick={() => handleAssignProcedure(enrollment.id)}
                    disabled={loading || !draft?.procedureTypeId}
                  >
                    Назначить процедуру
                  </Button>
                </div>
              </div>

              {enrollment.procedures.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Для этого марафона процедуры пока не назначены.
                </div>
              ) : (
                <div className="space-y-3">
                  {enrollment.procedures.map((procedure) => {
                    const editDraft = editDrafts[procedure.id];

                    return (
                      <div key={procedure.id} className="rounded-lg border p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{procedure.procedureType.title}</Badge>
                          <Badge variant={procedure.completedAt ? "success" : "warning"}>
                            {procedure.completedAt ? "Завершена" : "В процессе"}
                          </Badge>
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Тип процедуры</label>
                            <select
                              value={editDraft?.procedureTypeId ?? procedure.procedureType.id}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [procedure.id]: {
                                    ...prev[procedure.id],
                                    procedureTypeId: e.target.value,
                                  },
                                }))
                              }
                              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            >
                              {procedureTypes.map((procedureType) => (
                                <option key={procedureType.id} value={procedureType.id}>
                                  {procedureType.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Запланировано</label>
                            <Input
                              type="date"
                              value={editDraft?.scheduledAt ?? ""}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [procedure.id]: {
                                    ...prev[procedure.id],
                                    scheduledAt: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Выполнено</label>
                            <Input
                              type="date"
                              value={editDraft?.completedAt ?? ""}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [procedure.id]: {
                                    ...prev[procedure.id],
                                    completedAt: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Заметка</label>
                            <Input
                              value={editDraft?.notes ?? ""}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [procedure.id]: {
                                    ...prev[procedure.id],
                                    notes: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Комментарий"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleUpdateProcedure(procedure.id)}
                            disabled={loading}
                          >
                            Сохранить
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => handleDeleteProcedure(procedure.id)}
                            disabled={loading}
                          >
                            Удалить
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
