// Карточка урока/события для списков на странице курса и дашборда.
// Отображает статус (пройдено/в работе/закрыто), номер дня, тип и название.
// Поддерживает три состояния статуса и hover-анимацию с цветной полосой слева.
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { Badge } from "@/components/ui/badge";

export type LessonCardStatus = "completed" | "in_progress" | "available" | "locked" | "review";

type Props = {
  /** Ссылка, куда ведёт карточка. Если карточка locked — можно не передавать. */
  href?: string;
  /** Короткий eyebrow-лейбл (например, «День 3» или «Неделя 1 · День 2»). */
  eyebrow?: string;
  /** Тип контента: Видео / Процедура / Live / и т.д. */
  kind?: string;
  title: string;
  /** Одна строка пояснения (дата, длительность, статус проверки). */
  meta?: string;
  status: LessonCardStatus;
  /** Причина блокировки, показывается только при status === "locked". */
  lockedHint?: string;
  className?: string;
};

// Сопоставление статуса с визуальными атрибутами (цвет полосы/иконки, подпись).
const STATUS_MAP: Record<
  LessonCardStatus,
  { bar: string; icon: typeof CheckCircle2; iconClass: string; label: string; badgeVariant: "success" | "warning" | "secondary" | "outline" }
> = {
  completed: {
    bar: "bg-success",
    icon: CheckCircle2,
    iconClass: "text-success",
    label: "Пройдено",
    badgeVariant: "success",
  },
  in_progress: {
    bar: "bg-primary",
    icon: PlayCircle,
    iconClass: "text-primary",
    label: "В работе",
    badgeVariant: "warning",
  },
  review: {
    bar: "bg-warning",
    icon: Clock3,
    iconClass: "text-warning",
    label: "На проверке",
    badgeVariant: "warning",
  },
  available: {
    bar: "bg-muted-foreground/30",
    icon: PlayCircle,
    iconClass: "text-muted-foreground",
    label: "Доступно",
    badgeVariant: "outline",
  },
  locked: {
    bar: "bg-muted",
    icon: Lock,
    iconClass: "text-muted-foreground/70",
    label: "Закрыто",
    badgeVariant: "secondary",
  },
};

export function LessonCard({ href, eyebrow, kind, title, meta, status, lockedHint, className }: Props) {
  const s = STATUS_MAP[status];
  const Icon = s.icon;
  const isLocked = status === "locked" || !href;

  const content = (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 pl-5",
        "border-border/70",
        !isLocked && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        isLocked && "opacity-70",
        tokens.animation.fast,
        className
      )}
    >
      {/* Вертикальная цветная полоса-статус */}
      <span aria-hidden className={cn("absolute left-0 top-0 h-full w-1", s.bar)} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {(eyebrow || kind) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow && <span>{eyebrow}</span>}
              {eyebrow && kind && <span className="text-muted-foreground/40">·</span>}
              {kind && <span className="text-foreground/70">{kind}</span>}
            </div>
          )}
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </h3>
        </div>
        <Badge variant={s.badgeVariant} className="shrink-0 text-[10px]">
          {s.label}
        </Badge>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4 shrink-0", s.iconClass)} aria-hidden />
          <span className="truncate">{isLocked && lockedHint ? lockedHint : meta ?? s.label}</span>
        </span>
        {!isLocked && (
          <ArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </div>
    </article>
  );

  if (isLocked) {
    return <div className={cn("group block", className)}>{content}</div>;
  }

  return (
    <Link href={href!} className={cn("group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl", className)}>
      {content}
    </Link>
  );
}
