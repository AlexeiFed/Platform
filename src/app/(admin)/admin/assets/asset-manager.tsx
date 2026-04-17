"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tokens } from "@/lib/design-tokens";
import {
  Upload,
  FolderOpen,
  FileIcon,
  Copy,
  Image,
  Film,
  FileText,
  Check,
  Trash2,
  Eye,
  X,
  Pencil,
  Loader2,
} from "lucide-react";

type S3Object = {
  Key: string;
  Size: number;
  LastModified: string;
};

type FileCategory = "all" | "video" | "image" | "document";

type UploadJobStatus = "queued" | "presigning" | "uploading" | "done" | "error";

type UploadJob = {
  id: string;
  fileName: string;
  size: number;
  status: UploadJobStatus;
  progress: number; // 0..100
  key?: string;
  existingKey?: string;
  error?: string;
};

type SortKey = "date" | "name" | "size";
type SortDir = "desc" | "asc";

const QUICK_FOLDERS = [
  { label: "Все файлы", prefix: "" },
  { label: "Видео", prefix: "videos/" },
  { label: "Картинки", prefix: "images/" },
  { label: "Курсы", prefix: "courses/" },
  { label: "Домашние задания", prefix: "homework/" },
];

const CATEGORY_EXTENSIONS: Record<Exclude<FileCategory, "all">, RegExp> = {
  video: /\.(mp4|mov|avi|webm|mkv)$/i,
  image: /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i,
  document: /\.(pdf|doc|docx|txt|xlsx|pptx|zip|rar)$/i,
};

function getFileCategory(key: string): Exclude<FileCategory, "all"> {
  if (CATEGORY_EXTENSIONS.video.test(key)) return "video";
  if (CATEGORY_EXTENSIONS.image.test(key)) return "image";
  return "document";
}

function getPublicUrl(key: string) {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT ?? "https://storage.yandexcloud.net";
  return `${endpoint}/${bucket}/${key}`;
}

export function AssetManager({
  onSelect,
  defaultFilter = "all",
}: {
  onSelect?: (url: string, key: string) => void;
  defaultFilter?: FileCategory;
}) {
  const [mounted, setMounted] = useState(false);
  const [files, setFiles] = useState<S3Object[]>([]);
  const [prefix, setPrefix] = useState(defaultFilter === "video" ? "videos/" : defaultFilter === "image" ? "images/" : "");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploadJobsLimit, setUploadJobsLimit] = useState(8);
  const [hideDoneJobs, setHideDoneJobs] = useState(true);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [nameQuery, setNameQuery] = useState("");
  const [filter, setFilter] = useState<FileCategory>(defaultFilter);
  const [copied, setCopied] = useState<string | null>(null);
  const [preview, setPreview] = useState<S3Object | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const uploadXhrByJobIdRef = useRef<Record<string, XMLHttpRequest | undefined>>({});
  const cancelledJobIdsRef = useRef<Set<string>>(new Set());
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [nextFilesToken, setNextFilesToken] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (autoLoaded) return;
    if (defaultFilter === "all") return;
    setAutoLoaded(true);
    loadFilesImmediate(defaultFilter === "video" ? "videos/" : defaultFilter === "image" ? "images/" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoaded, defaultFilter]);

  function loadFilesImmediate(p: string) {
    setLoading(true);
    fetch(`/api/s3/list?prefix=${encodeURIComponent(p)}&maxKeys=50`)
      .then((r) => r.json())
      .then((data) => {
        setFiles(data.files ?? []);
        setHasMoreFiles(Boolean(data.hasMore));
        setNextFilesToken((data.nextToken as string | undefined) ?? null);
      })
      .finally(() => setLoading(false));
  }

  const loadFiles = useCallback(async (searchPrefix?: string) => {
    setLoading(true);
    try {
      const p = searchPrefix ?? prefix;
      const res = await fetch(`/api/s3/list?prefix=${encodeURIComponent(p)}&maxKeys=50`);
      const data = await res.json();
      setFiles(data.files ?? []);
      setHasMoreFiles(Boolean(data.hasMore));
      setNextFilesToken((data.nextToken as string | undefined) ?? null);
    } catch {
      // silent
    }
    setLoading(false);
  }, [prefix]);

  const loadMoreFiles = useCallback(async () => {
    if (!hasMoreFiles || !nextFilesToken) return;
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/s3/list?prefix=${encodeURIComponent(prefix)}&maxKeys=50&token=${encodeURIComponent(nextFilesToken)}`
      );
      const data = await res.json();
      const incoming: S3Object[] = data.files ?? [];
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.Key));
        const merged = [...prev];
        for (const f of incoming) {
          if (!seen.has(f.Key)) merged.push(f);
        }
        return merged;
      });
      setHasMoreFiles(Boolean(data.hasMore));
      setNextFilesToken((data.nextToken as string | undefined) ?? null);
    } catch {
      // silent
    }
    setLoading(false);
  }, [hasMoreFiles, nextFilesToken, loading, prefix]);

  function uid() {
    return crypto.randomUUID();
  }

  function scheduleAutoHideDoneJob(jobId: string) {
    window.setTimeout(() => {
      setUploadJobs((prev) => prev.filter((j) => !(j.id === jobId && j.status === "done")));
    }, 900);
  }

  function xhrPutWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
    return new Promise<{ xhr: XMLHttpRequest; done: Promise<void> }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      const done = new Promise<void>((doneResolve, doneReject) => {
        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable) return;
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
          onProgress(pct);
        };
        xhr.onerror = () => doneReject(new Error("Upload failed"));
        xhr.onabort = () => doneReject(new Error("Upload cancelled"));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) doneResolve();
          else doneReject(new Error(`Upload failed (${xhr.status})`));
        };
      });

      xhr.send(file);
      resolve({ xhr, done });
    });
  }

  function getAutoPrefix(file: File) {
    return file.type.startsWith("video/")
      ? "videos"
      : file.type.startsWith("image/")
        ? "images"
        : "attachments";
  }

  const fileNameOf = useCallback((key: string) => key.split("/").pop() ?? key, []);

  const filteredFiles = useMemo(() => {
    if (filter === "all") return files;
    return files.filter((f) => getFileCategory(f.Key) === filter);
  }, [files, filter]);

  const sortedFiles = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const q = nameQuery.trim().toLowerCase();
    const list = q
      ? filteredFiles.filter((f) => fileNameOf(f.Key).toLowerCase().includes(q))
      : [...filteredFiles];
    list.sort((a, b) => {
      if (sortKey === "size") return (a.Size - b.Size) * dir;
      if (sortKey === "name") return fileNameOf(a.Key).localeCompare(fileNameOf(b.Key), "ru") * dir;
      const ad = Date.parse(a.LastModified ?? "") || 0;
      const bd = Date.parse(b.LastModified ?? "") || 0;
      return (ad - bd) * dir;
    });
    return list;
  }, [filteredFiles, sortKey, sortDir, nameQuery, fileNameOf]);

  const visibleUploadJobs = useMemo(() => {
    const list = hideDoneJobs ? uploadJobs.filter((j) => j.status !== "done") : uploadJobs;
    return list;
  }, [uploadJobs, hideDoneJobs]);

  const uploadStats = useMemo(() => {
    const total = uploadJobs.length;
    const done = uploadJobs.filter((j) => j.status === "done").length;
    const uploadingCount = uploadJobs.filter((j) => j.status === "uploading" || j.status === "presigning").length;
    const queued = uploadJobs.filter((j) => j.status === "queued").length;
    const errors = uploadJobs.filter((j) => j.status === "error").length;
    return { total, done, uploadingCount, queued, errors };
  }, [uploadJobs]);

  const counts = useMemo(() => {
    const c = { all: files.length, video: 0, image: 0, document: 0 };
    for (const f of files) {
      c[getFileCategory(f.Key)]++;
    }
    return c;
  }, [files]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;

    const selected = Array.from(list);
    const jobs: UploadJob[] = selected.map((f) => ({
      id: uid(),
      fileName: f.name,
      size: f.size,
      status: "queued",
      progress: 0,
    }));

    setUploading(true);
    setUploadJobs((prev) => [...jobs, ...prev]);

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i]!;
      const jobId = jobs[i]!.id;
      const targetPrefix = (prefix || getAutoPrefix(file)).replace(/\/?$/, "");

      try {
        if (cancelledJobIdsRef.current.has(jobId)) continue;

        if (!allowDuplicates) {
          const normalizedPrefix = targetPrefix.replace(/\/?$/, "") + "/";
          const candidates = files.filter((f) => f.Key.startsWith(normalizedPrefix));
          const exact = candidates.find((f) => getFileName(f.Key) === file.name);
          const existingKey = exact?.Key ?? null;
          if (existingKey) {
            setUploadJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? { ...j, status: "error", progress: 0, existingKey, error: "Файл с таким именем уже есть в этой папке" }
                  : j
              )
            );
            continue;
          }
        }

        if (cancelledJobIdsRef.current.has(jobId)) continue;

        setUploadJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: "presigning", progress: 0 } : j))
        );

        const presignRes = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            path: targetPrefix,
          }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Ошибка получения URL для загрузки");
        }

        if (cancelledJobIdsRef.current.has(jobId)) continue;

        const { url, key } = (await presignRes.json()) as { url: string; key: string };
        setUploadJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: "uploading", key } : j))
        );

        const { xhr, done } = await xhrPutWithProgress(url, file, (pct) => {
          setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, progress: pct } : j)));
        });
        uploadXhrByJobIdRef.current[jobId] = xhr;

        await done;

        if (cancelledJobIdsRef.current.has(jobId)) continue;

        setUploadJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: "done", progress: 100 } : j))
        );

        // Мгновенно отражаем файл в списке, без перезагрузки страницы.
        setFiles((prev) => {
          const exists = prev.some((f) => f.Key === key);
          const nextObj: S3Object = {
            Key: key,
            Size: file.size,
            LastModified: new Date().toISOString(),
          };
          if (exists) return prev.map((f) => (f.Key === key ? nextObj : f));
          return [nextObj, ...prev];
        });

        scheduleAutoHideDoneJob(jobId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
        if (msg.toLowerCase().includes("cancel")) {
          // job уже удалён из UI при отмене
          continue;
        }
        setUploadJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: "error", error: msg } : j))
        );
      }
    }

    // Финальная синхронизация со стореджем (точные даты/размеры/сортировка).
    await loadFiles();
    // Авто-очистка: оставляем только ошибки.
    setUploadJobs((prev) => prev.filter((j) => j.status === "error"));
    setUploading(false);
    e.target.value = "";
  }

  function copyUrl(key: string) {
    const url = getPublicUrl(key);
    navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSelect(file: S3Object) {
    if (onSelect) {
      onSelect(getPublicUrl(file.Key), file.Key);
    }
  }

  async function handleDelete(key: string) {
    setDeleting(key);
    try {
      await fetch("/api/s3/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      setFiles((prev) => prev.filter((f) => f.Key !== key));
    } catch {
      alert("Ошибка удаления");
    }
    setDeleting(null);
  }

  function openRename(key: string) {
    setRenamingKey(key);
    setRenameValue(getFileName(key));
  }

  function getDir(key: string) {
    const parts = key.split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/") + "/";
  }

  async function handleRenameSave() {
    if (!renamingKey) return;
    const nextName = renameValue.trim();
    if (!nextName || nextName.includes("/")) {
      alert("Название файла не должно быть пустым и не должно содержать /");
      return;
    }

    const fromKey = renamingKey;
    const toKey = `${getDir(fromKey)}${nextName}`;
    if (toKey === fromKey) {
      setRenamingKey(null);
      setRenameValue("");
      return;
    }

    setRenaming(true);
    try {
      const res = await fetch("/api/s3/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromKey, toKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка переименования");
      }
      setFiles((prev) => prev.map((f) => (f.Key === fromKey ? { ...f, Key: toKey } : f)));
      if (preview?.Key === fromKey) setPreview({ ...preview, Key: toKey });
      setRenamingKey(null);
      setRenameValue("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка переименования";
      alert(msg);
    }
    setRenaming(false);
  }

  function getIcon(key: string) {
    const cat = getFileCategory(key);
    if (cat === "image") return <Image className="h-5 w-5 text-blue-500" />;
    if (cat === "video") return <Film className="h-5 w-5 text-primary" />;
    return <FileText className="h-5 w-5 text-orange-500" />;
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function getFileName(key: string) {
    return fileNameOf(key);
  }

  // Пререндер Next.js сравнивает HTML сервера/клиента. Чтобы исключить hydration mismatch,
  // рендерим UI только после монтирования.
  if (!mounted) {
    return <div className="space-y-4" />;
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Quick folders */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FOLDERS.map((folder) => (
          <Button
            key={folder.prefix}
            type="button"
            variant={prefix === folder.prefix ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPrefix(folder.prefix);
              loadFiles(folder.prefix);
            }}
          >
            {folder.label}
          </Button>
        ))}
      </div>

      {/* Search + Upload */}
      <div className="flex gap-3">
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Путь/префикс..."
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadFiles()}
          />
          <Button type="button" onClick={() => loadFiles()} disabled={loading}>
            <FolderOpen className="h-4 w-4 mr-2" />
            {loading ? "..." : "Обзор"}
          </Button>
        </div>
        <div className="relative">
          <input
            type="file"
            onChange={handleUpload}
            multiple
            accept="video/*,image/*,.pdf,.doc,.docx,.txt,.zip"
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
          />
          <Button type="button" variant="outline" disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Загружаем..." : "Загрузить"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Сортировка:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            aria-label="Сортировка"
          >
            <option value="date">По дате</option>
            <option value="name">По имени</option>
            <option value="size">По размеру</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
            className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            aria-label="Направление сортировки"
          >
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowDuplicates}
            onChange={(e) => setAllowDuplicates(e.target.checked)}
            disabled={uploading}
          />
          Разрешать дубли (одинаковые имена)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Поиск по названию…"
          className="h-9 max-w-sm"
          aria-label="Поиск по названию файла"
        />
        {nameQuery.trim() ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setNameQuery("")}>
            Очистить
          </Button>
        ) : null}
      </div>

      {/* Upload status */}
      {uploadJobs.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Загрузка</p>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                <p className="text-xs text-muted-foreground">
                  {uploading
                    ? `Идёт загрузка: ${uploadStats.done}/${uploadStats.total}`
                    : `Завершено: ${uploadStats.done}/${uploadStats.total}`}
                  {uploadStats.errors > 0 ? ` · Ошибки: ${uploadStats.errors}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHideDoneJobs((v) => !v)}
              >
                {hideDoneJobs ? "Показать завершённые" : "Скрыть завершённые"}
              </Button>
            </div>
            <div className="space-y-2">
              {visibleUploadJobs.slice(0, uploadJobsLimit).map((j) => (
                <div key={j.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium [overflow-wrap:break-word] [word-break:normal]">{j.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.status === "queued" && "В очереди"}
                        {j.status === "presigning" && "Подготовка…"}
                        {j.status === "uploading" && `Загрузка… ${j.progress}%`}
                        {j.status === "done" && "Готово"}
                        {j.status === "error" && (j.error ?? "Ошибка")}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {j.status === "uploading" || j.status === "presigning" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Отменить"
                          onClick={() => {
                            cancelledJobIdsRef.current.add(j.id);
                            const xhr = uploadXhrByJobIdRef.current[j.id];
                            if (xhr) xhr.abort();
                            delete uploadXhrByJobIdRef.current[j.id];
                            setUploadJobs((prev) => prev.filter((x) => x.id !== j.id));
                          }}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      ) : j.status === "queued" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Убрать из очереди"
                          onClick={() => {
                            cancelledJobIdsRef.current.add(j.id);
                            setUploadJobs((prev) => prev.filter((x) => x.id !== j.id));
                          }}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      ) : j.status === "done" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : j.status === "error" ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2">
                    <Progress value={j.status === "done" ? 100 : j.progress} />
                  </div>
                  {j.status === "error" && j.existingKey ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setUploadJobs((prev) => prev.filter((x) => x.id !== j.id))}>
                        Пропустить
                      </Button>
                      <Button type="button" size="sm" onClick={() => setAllowDuplicates(true)} disabled={uploading}>
                        Всё равно загрузить
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {visibleUploadJobs.length > uploadJobsLimit ? (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className={tokens.typography.small}>Ещё {visibleUploadJobs.length - uploadJobsLimit}…</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadJobsLimit((n) => Math.min(n + 8, visibleUploadJobs.length))}
                  >
                    Показать ещё
                  </Button>
                </div>
              ) : null}
              {visibleUploadJobs.length > 0 && visibleUploadJobs.length > 8 && uploadJobsLimit > 8 ? (
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setUploadJobsLimit(8)}>
                    Свернуть
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Type filters */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Фильтр:</span>
          {(
            [
              { key: "all" as FileCategory, label: "Все", icon: FileIcon },
              { key: "video" as FileCategory, label: "Видео", icon: Film },
              { key: "image" as FileCategory, label: "Картинки", icon: Image },
              { key: "document" as FileCategory, label: "Документы", icon: FileText },
            ] as const
          ).map((f) => (
            <Button
              key={f.key}
              type="button"
              variant={filter === f.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f.key)}
              className="gap-1.5 shrink-0"
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.label}
              <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                {counts[f.key]}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      {/* File list */}
      <div className="min-w-0 space-y-2">
        {sortedFiles.map((file) => {
          const cat = getFileCategory(file.Key);
          const isImage = cat === "image";
          const url = getPublicUrl(file.Key);

          return (
            <Card key={file.Key} className="group w-full min-w-0 overflow-hidden">
              <CardContent className="flex min-w-0 flex-col gap-3 p-3">
                <div className="flex w-full min-w-0 gap-3">
                  {isImage ? (
                    <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted">
                      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  ) : cat === "video" ? (
                    // Миниатюра первого кадра видео (16:9, чуть крупнее иконки)
                    <div className="h-10 w-[72px] shrink-0 rounded-md overflow-hidden bg-muted">
                      <video
                        src={url}
                        preload="metadata"
                        className="h-full w-full object-cover"
                        muted
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      {getIcon(file.Key)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium [overflow-wrap:break-word] [word-break:normal]">
                      {getFileName(file.Key)}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:break-word] [word-break:normal]">
                      <span className="text-muted-foreground/70">{file.Key.split("/").slice(0, -1).join("/")}/</span>
                      {" · "}
                      {formatSize(file.Size)}
                      {" · "}
                      {new Date(file.LastModified).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-2">
                  {(isImage || cat === "video") && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreview(file)}
                      aria-label="Превью"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openRename(file.Key)}
                    aria-label="Переименовать"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => copyUrl(file.Key)}
                    aria-label="Скопировать URL"
                  >
                    {copied === file.Key ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteKey(file.Key)}
                    disabled={deleting === file.Key}
                    aria-label="Удалить"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {onSelect && (
                    <Button type="button" size="sm" onClick={() => handleSelect(file)}>
                      Выбрать
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {hasMoreFiles && (
          <div className="pt-2 flex justify-center">
            <Button type="button" variant="outline" onClick={() => void loadMoreFiles()} disabled={loading}>
              {loading ? "..." : "Загрузить ещё"}
            </Button>
          </div>
        )}

        {filteredFiles.length === 0 && files.length > 0 && (
          <div className="text-center py-8">
            <p className={tokens.typography.small}>
              Нет файлов типа &quot;{filter}&quot;. Попробуйте другой фильтр.
            </p>
          </div>
        )}

        {files.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className={tokens.typography.small}>
              Выберите папку или нажмите &quot;Обзор&quot; для загрузки файлов
            </p>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setPreview(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            {getFileCategory(preview.Key) === "image" ? (
              <img
                src={getPublicUrl(preview.Key)}
                alt={getFileName(preview.Key)}
                className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
              />
            ) : (
              <video
                src={getPublicUrl(preview.Key)}
                controls
                autoPlay
                className="w-full max-h-[85vh] rounded-lg"
              />
            )}
            <p className="text-white text-sm mt-2 text-center">{getFileName(preview.Key)}</p>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renamingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => !renaming && setRenamingKey(null)}>
          <div className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <Card className={tokens.shadow.md}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Переименовать</p>
                    <p className="text-xs text-muted-foreground break-words">{renamingKey}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => !renaming && setRenamingKey(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleRenameSave())}
                    disabled={renaming}
                    placeholder="Новое имя файла"
                  />
                  <p className={tokens.typography.small}>Меняется только имя файла в текущей папке (без “/”).</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => !renaming && setRenamingKey(null)} disabled={renaming}>
                    Отмена
                  </Button>
                  <Button type="button" onClick={() => void handleRenameSave()} disabled={renaming}>
                    {renaming ? "..." : "Сохранить"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <Dialog open={deleteKey != null} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить файл?</DialogTitle>
            <DialogDescription>
              {deleteKey ? (
                <>
                  Файл <span className="font-medium text-foreground">“{getFileName(deleteKey)}”</span> будет удалён без
                  возможности восстановления.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteKey(null)} disabled={deleting != null}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deleteKey) return;
                const key = deleteKey;
                setDeleteKey(null);
                await handleDelete(key);
              }}
              disabled={deleteKey == null || deleting != null}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
