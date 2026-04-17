"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Menu, LogOut, User, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getInitials } from "@/lib/utils";
import { layout } from "@/lib/design-tokens";
import { useHeaderSlot } from "@/lib/header-slot";
import { useState } from "react";

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);
  const { slot } = useHeaderSlot();

  return (
    <header className={`${layout.header.height} border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40 flex items-center px-4 sm:px-6`}>
      <div className="flex items-center gap-3 flex-1 min-w-0 md:hidden">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuToggle} aria-label="Меню">
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2 md:hidden">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="font-bold">LearnHub</span>
        </Link>
      </div>

      {/* Слот для страниц — например, табы редактора курса */}
      {slot && (
        <div className="flex-1 flex items-center justify-center overflow-x-auto px-2 no-scrollbar">
          {slot}
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        <ThemeToggle />
        {session?.user ? (
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image ?? undefined} />
                <AvatarFallback>{getInitials(session.user.name ?? "U")}</AvatarFallback>
              </Avatar>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 w-48 bg-popover border rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                </div>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => setShowMenu(false)}
                >
                  <User className="h-4 w-4" />
                  Профиль
                </Link>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent w-full text-left text-destructive"
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
    </header>
  );
}
