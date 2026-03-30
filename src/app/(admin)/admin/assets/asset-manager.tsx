"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

type S3Object = {
  Key: string;
  Size: number;
  LastModified: string;
};

type FileCategory = "all" | "video" | "image" | "document";

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
  const [files, setFiles] = useState<S3Object[]>([]);
  const [prefix, setPrefix] = useState(defaultFilter === "video" ? "videos/" : defaultFilter === "image" ? "images/" : "");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<FileCategory>(defaultFilter);
  const [copied, setCopied] = useState<string | null>(null);
  const [preview, setPreview] = useState<S3Object | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  if (!autoLoaded && defaultFilter !== "all") {
    setAutoLoaded(true);
    loadFilesImmediate(defaultFilter === "video" ? "videos/" : defaultFilter === "image" ? "images/" : "");
  }

  function loadFilesImmediate(p: string) {
    setLoading(true);
    fetch(`/api/s3/list?prefix=${encodeURIComponent(p)}`)
      .then((r) => r.json())
      .then((data) => setFiles(data.files ?? []))
      .finally(() => setLoading(false));
  }

  const loadFiles = useCallback(async (searchPrefix?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/s3/list?prefix=${encodeURIComponent(searchPrefix ?? prefix)}`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      // silent
    }
    setLoading(false);
  }, [prefix]);

  const filteredFiles = useMemo(() => {
    if (filter === "all") return files;
    return files.filter((f) => getFileCategory(f.Key) === filter);
  }, [files, filter]);

  const counts = useMemo(() => {
    const c = { all: files.length, video: 0, image: 0, document: 0 };
    for (const f of files) {
      c[getFileCategory(f.Key)]++;
    }
    return c;
  }, [files]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const autoPrefix = file.type.startsWith("video/")
      ? "videos"
      : file.type.startsWith("image/")
        ? "images"
        : "attachments";

    setUploading(true);
    try {
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          path: prefix || autoPrefix,
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json();
        alert(err.error ?? "Ошибка получения URL для загрузки");
        setUploading(false);
        return;
      }

      const { url, key } = await presignRes.json();

      await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      await loadFiles();
    } catch {
      alert("Ошибка загрузки файла");
    }
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
    if (!confirm(`Удалить файл ${key.split("/").pop()}?`)) return;
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

  function getIcon(key: string) {
    const cat = getFileCategory(key);
    if (cat === "image") return <Image className="h-5 w-5 text-blue-500" />;
    if (cat === "video") return <Film className="h-5 w-5 text-purple-500" />;
    return <FileText className="h-5 w-5 text-orange-500" />;
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function getFileName(key: string) {
    return key.split("/").pop() ?? key;
  }

  return (
    <div className="space-y-4">
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

      {/* Type filters */}
      {files.length > 0 && (
        <div className="flex gap-2 items-center">
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
              className="gap-1.5"
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
      <div className="space-y-2">
        {filteredFiles.map((file) => {
          const cat = getFileCategory(file.Key);
          const isImage = cat === "image";
          const url = getPublicUrl(file.Key);

          return (
            <Card key={file.Key} className="group">
              <CardContent className="flex items-center gap-3 p-3">
                {/* Thumbnail for images */}
                {isImage ? (
                  <div className="h-10 w-10 rounded-md overflow-hidden bg-muted shrink-0">
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    {getIcon(file.Key)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{getFileName(file.Key)}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70">{file.Key.split("/").slice(0, -1).join("/")}/</span>
                    {" · "}
                    {formatSize(file.Size)}
                    {" · "}
                    {new Date(file.LastModified).toLocaleDateString("ru-RU")}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={() => handleDelete(file.Key)}
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
    </div>
  );
}
