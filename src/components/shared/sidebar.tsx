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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens, layout } from "@/lib/design-tokens";

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
  { label: "Файлы", href: "/admin/assets", icon: FolderOpen },
  { label: "Настройки", href: "/admin/settings", icon: Settings },
];

const studentNav: NavItem[] = [
  { label: "Моё обучение", href: "/dashboard", icon: GraduationCap },
  { label: "Каталог", href: "/catalog", icon: ShoppingBag },
];

export function Sidebar({ variant = "admin" }: { variant?: "admin" | "student" }) {
  const pathname = usePathname();
  const items = variant === "admin" ? adminNav : studentNav;

  return (
    <aside className={cn(layout.sidebar.width, "hidden md:flex flex-col border-r bg-card h-screen sticky top-0")}>
      <div className="flex items-center gap-2 px-6 h-16 border-b">
        <GraduationCap className="h-7 w-7 text-primary" />
        <span className="font-bold text-lg">LearnHub</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
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
    </aside>
  );
}
