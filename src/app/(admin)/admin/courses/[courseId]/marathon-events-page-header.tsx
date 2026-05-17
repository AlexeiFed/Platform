"use client";

import { useLayoutEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { MarathonEventsDayNav } from "./marathon-events-day-nav";
import type { ProductType } from "@prisma/client";

type MarathonEventsPageHeaderProps = {
  title: string;
  type: ProductType;
  published: boolean;
  days: number[];
  onStickyHeightChange: (height: number) => void;
};

export function MarathonEventsPageHeader({
  title,
  type,
  published,
  days,
  onStickyHeightChange,
}: MarathonEventsPageHeaderProps) {
  const stickyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = stickyRef.current;
    if (!el) return;

    const report = () => onStickyHeightChange(el.offsetHeight);
    report();

    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title, type, published, days, onStickyHeightChange]);

  return (
    <div
      ref={stickyRef}
      id="marathon-events-sticky-header"
      className={cn(
        "fixed top-16 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "left-0 right-0 px-4 pb-2 pt-1 sm:px-6 lg:px-8 md:left-64",
      )}
    >
      <h1 className={cn(tokens.typography.h2, "text-xl sm:text-2xl leading-tight")}>{title}</h1>
      <div className="mt-1 flex items-center gap-2">
        <Badge variant={type === "COURSE" ? "default" : "secondary"} className="text-xs">
          {type === "COURSE" ? "Курс" : "Марафон"}
        </Badge>
        <Badge variant={published ? "success" : "outline"} className="text-xs">
          {published ? "Опубликован" : "Черновик"}
        </Badge>
      </div>
      <MarathonEventsDayNav days={days} />
    </div>
  );
}
