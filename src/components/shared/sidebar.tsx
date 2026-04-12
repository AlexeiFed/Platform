"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens, layout } from "@/lib/design-tokens";
import { CourseNavSidebarSection } from "@/components/shared/course-nav-sidebar-section";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const adminNav: NavItem[] = [
  { label: "Дашборд", href: "/admin", icon: LayoutDashboard },
  { label: "Курсы", href: "/admin/courses", icon: BookOpen },
  { label: "Пользователи", href: "/admin/users", icon: Users },
  { label: "Домашние задания", href: "/admin/homework", icon: ClipboardCheck },
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
}: {
  variant?: "admin" | "student";
  mobileDrawer?: boolean;
}) {
  const pathname = usePathname();
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
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                  tokens.animation.fast,
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {variant === "student" ? <CourseNavSidebarSection /> : null}
      </div>
    </aside>
  );
}
