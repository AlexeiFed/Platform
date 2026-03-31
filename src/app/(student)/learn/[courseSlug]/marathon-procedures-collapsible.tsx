"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { ClipboardList, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function MarathonProceduresCollapsible({
  title = "Процедуры",
  subtitle,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardContent className="space-y-0 p-0">
        <div className="flex items-stretch gap-2 p-4">
          <Button
            type="button"
            variant="ghost"
            className={cn("h-auto flex-1 justify-between gap-3 px-2 py-1 text-left font-normal hover:bg-transparent", tokens.animation.fast)}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {title}
              </span>
              {subtitle ? <span className={tokens.typography.small}>{subtitle}</span> : null}
            </span>
            <ChevronDown
              className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </Button>
        </div>
        {open ? <div className="space-y-3 border-t px-4 pb-4 pt-3">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
