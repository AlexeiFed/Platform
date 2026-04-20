"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getInitials } from "@/lib/utils";
import { layout } from "@/lib/design-tokens";
import { useHeaderSlot } from "@/lib/header-slot";
import { useState, useEffect } from "react";
import { SignOutConfirmDialog } from "@/components/shared/sign-out-confirm-dialog";

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { slot } = useHeaderSlot();
  /** Не ветвить по `useSession().status`: на SSR часто уже `unauthenticated`, на клиенте первый кадр — `loading` → hydration mismatch */
  const [authUiReady, setAuthUiReady] = useState(false);
  useEffect(() => {
    setAuthUiReady(true);
  }, []);

  return (
    <header className={`${layout.header.height} border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40 flex items-center gap-2 px-4 sm:px-6`}>
      <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onMenuToggle} aria-label="Меню">
        <Menu className="h-5 w-5" />
      </Button>

      {/* Слот для страниц — например, табы редактора курса */}
      {slot ? (
        <nav
          className="no-scrollbar flex min-w-0 flex-1 items-center justify-start overflow-x-auto overscroll-x-contain py-0.5 [-webkit-overflow-scrolling:touch]"
          aria-label="Разделы страницы"
        >
          {slot}
        </nav>
      ) : (
        <div className="min-w-0 flex-1 md:hidden" aria-hidden />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {!authUiReady ? (
          <>
            <div className="h-9 w-[4.5rem] shrink-0 rounded-md bg-muted/60 md:hidden" aria-hidden />
            <div className="hidden items-center gap-2 md:flex">
              <div className="h-9 w-9 shrink-0 rounded-md bg-muted/60" aria-hidden />
              <div className="h-9 w-9 shrink-0 rounded-full bg-muted/60" aria-hidden />
            </div>
          </>
        ) : (
          <>
            {!session?.user ? (
              <Button asChild size="sm" className="md:hidden">
                <Link href="/login">Войти</Link>
              </Button>
            ) : null}
            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
              {session?.user ? (
                <div className="relative">
                  <button type="button" onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={session.user.image ?? undefined} />
                      <AvatarFallback>{getInitials(session.user.name ?? "U")}</AvatarFallback>
                    </Avatar>
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border bg-popover py-1 shadow-lg">
                      <div className="border-b px-3 py-2">
                        <p className="text-sm font-medium">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground">{session.user.email}</p>
                      </div>
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => setShowMenu(false)}
                      >
                        <User className="h-4 w-4" />
                        Профиль
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setSignOutOpen(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                      >
                        <LogOut className="h-4 w-4" />
                        Выйти
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Button asChild size="sm">
                  <Link href="/login">Войти</Link>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </header>
  );
}
