/**
 * landing-renderer.tsx
 * Рендерер блоков лендинга для публичной страницы курса/марафона.
 * Поддерживает типы: hero, heading, text, features, image, video, divider.
 */
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { CheckCircle2 } from "lucide-react";
import type { LandingBlock } from "@/types/landing";

// === Компонент встраивания видео ===

function VideoEmbed({ url, title }: { url: string; title: string }) {
  // Поддержка YouTube и прямых видеофайлов
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  const isVimeo = /vimeo\.com/.test(url);

  if (isYouTube) {
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
    if (videoId) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }
  }

  if (isVimeo) {
    const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
    if (videoId) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }
  }

  // Прямой видеофайл
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video src={url} controls className="h-full w-full" title={title}>
        <track kind="captions" />
      </video>
    </div>
  );
}

// === Рендер отдельных блоков ===

function HeroBlock({ block }: { block: Extract<LandingBlock, { type: "hero" }> }) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl min-h-[320px] sm:min-h-[420px] flex items-end">
      {block.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.imageUrl}
            alt={block.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/60" />
      )}
      <div className="relative z-10 p-6 sm:p-10 space-y-2">
        {block.title && (
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight drop-shadow">
            {block.title}
          </h1>
        )}
        {block.subtitle && (
          <p className="text-base sm:text-xl text-white/90 max-w-2xl drop-shadow">
            {block.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function HeadingBlock({ block }: { block: Extract<LandingBlock, { type: "heading" }> }) {
  if (block.level === 2) {
    return <h2 className={cn(tokens.typography.h2, "text-foreground")}>{block.text}</h2>;
  }
  return <h3 className={cn(tokens.typography.h3, "text-foreground")}>{block.text}</h3>;
}

function TextBlock({ block }: { block: Extract<LandingBlock, { type: "text" }> }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-wrap">{block.content}</p>
    </div>
  );
}

function FeaturesBlock({ block }: { block: Extract<LandingBlock, { type: "features" }> }) {
  const validItems = block.items.filter(Boolean);
  if (!validItems.length && !block.title) return null;

  return (
    <div className="rounded-2xl border bg-muted/40 p-6 sm:p-8 space-y-4">
      {block.title && (
        <h3 className={cn(tokens.typography.h3, "text-foreground")}>{block.title}</h3>
      )}
      {validItems.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-3">
          {validItems.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImageBlock({ block }: { block: Extract<LandingBlock, { type: "image" }> }) {
  if (!block.url) return null;
  return (
    <figure className={cn("space-y-2", block.fullWidth ? "w-full" : "max-w-2xl mx-auto")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt={block.caption || ""}
        className="w-full rounded-xl object-cover"
      />
      {block.caption && (
        <figcaption className="text-center text-sm text-muted-foreground">{block.caption}</figcaption>
      )}
    </figure>
  );
}

function VideoBlock({ block }: { block: Extract<LandingBlock, { type: "video" }> }) {
  if (!block.url) return null;
  return (
    <div className="space-y-2">
      {block.title && <p className="text-sm font-medium text-muted-foreground">{block.title}</p>}
      <VideoEmbed url={block.url} title={block.title} />
    </div>
  );
}

function DividerBlock() {
  return <hr className="border-border my-2" />;
}

// === Главный компонент рендера ===

type Props = {
  blocks: LandingBlock[];
};

export function LandingRenderer({ blocks }: Props) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        switch (block.type) {
          case "hero":     return <HeroBlock key={block.id} block={block} />;
          case "heading":  return <HeadingBlock key={block.id} block={block} />;
          case "text":     return <TextBlock key={block.id} block={block} />;
          case "features": return <FeaturesBlock key={block.id} block={block} />;
          case "image":    return <ImageBlock key={block.id} block={block} />;
          case "video":    return <VideoBlock key={block.id} block={block} />;
          case "divider":  return <DividerBlock key={block.id} />;
          default:         return null;
        }
      })}
    </div>
  );
}
