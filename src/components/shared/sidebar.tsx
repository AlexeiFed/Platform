"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ClipboardCheck,
  FolderOpen,
  Settings,
  GraduationCap,
  ShoppingBag,
  Wallet,
  MessageSquare,
  Video,
  User,
  LogOut,
  Library,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens, layout } from "@/lib/design-tokens";
import { CourseNavSidebarSection } from "@/components/shared/course-nav-sidebar-section";
import { FeedbackUnreadBadge } from "@/components/shared/feedback-unread-badge";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SignOutConfirmDialog } from "@/components/shared/sign-out-confirm-dialog";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const adminNav: NavItem[] = [
  { label: "Дашборд", href: "/admin", icon: LayoutDashboard },
  { label: "Курсы", href: "/admin/courses", icon: BookOpen },
  { label: "Доп. материалы", href: "/admin/additional-materials", icon: Library },
  { label: "Эфиры", href: "/admin/live", icon: Video },
  { label: "Пользователи", href: "/admin/users", icon: Users },
  { label: "Домашние задания", href: "/admin/homework", icon: ClipboardCheck },
  { label: "Оценки", href: "/admin/grades", icon: Star },
  { label: "Обратная связь", href: "/admin/feedback", icon: MessageSquare },
  { label: "Оплата", href: "/admin/payments", icon: Wallet },
  { label: "Файлы", href: "/admin/assets", icon: FolderOpen },
  { label: "Настройки", href: "/admin/settings", icon: Settings },
];

const studentNav: NavItem[] = [
  { label: "Моё обучение", href: "/dashboard", icon: GraduationCap },
  { label: "Каталог", href: "/catalog", icon: ShoppingBag },
];

export function Sidebar({
  variant = "admin",
  /** В оверлее бургер-меню: без `hidden md:flex`, иначе на мобилке панель пустая */
  mobileDrawer = false,
  /** Закрыть мобильный drawer после перехода по пункту меню */
  onNavigate,
}: {
  variant?: "admin" | "student";
  mobileDrawer?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const items = variant === "admin" ? adminNav : studentNav;

  return (
    <aside
      className={cn(
        layout.sidebar.width,
        "flex flex-col border-r bg-card",
        mobileDrawer
          ? "h-full min-h-0 w-full"
          : "hidden h-screen sticky top-0 md:flex"
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-6 h-16">
        <GraduationCap className="h-7 w-7 text-primary" />
        <span className="font-bold text-lg">LearnHub</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="shrink-0 space-y-1 px-3 py-4">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavigate?.()}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                  tokens.animation.fast,
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/admin/feedback" && variant === "admin" && (
                  <FeedbackUnreadBadge />
                )}
              </Link>
            );
          })}
        </nav>
        {variant === "student" ? (
          <Suspense fallback={null}>
            <CourseNavSidebarSection onNavigate={onNavigate} />
          </Suspense>
        ) : null}
      </div>
      {mobileDrawer ? (
        <div className="shrink-0 space-y-1 border-t border-border px-3 py-4">
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <span className={tokens.typography.label}>Тема</span>
            <ThemeToggle />
          </div>
          {session?.user ? (
            <>
              <Link
                href="/profile"
                onClick={() => onNavigate?.()}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  tokens.animation.fast,
                  pathname.startsWith("/profile")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <User className="h-5 w-5" />
                Профиль
              </Link>
              <button
                type="button"
                onClick={() => setSignOutOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive hover:bg-accent"
              >
                <LogOut className="h-5 w-5" />
                Выйти
              </button>
              <SignOutConfirmDialog
                open={signOutOpen}
                onOpenChange={setSignOutOpen}
                onBeforeSignOut={() => onNavigate?.()}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
