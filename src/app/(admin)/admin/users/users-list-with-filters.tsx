"use client";

import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { CuratorProductsForm } from "./curator-products-form";
import { GrantAccessForm } from "./grant-access-form";
import { UserRoleForm } from "./user-role-form";
import { DeleteUserButton } from "./delete-user-button";

type Role = "ADMIN" | "USER" | "CURATOR";

type Tariff = {
  id: string;
  name: string;
  price: number;
  currency: string;
  published: boolean;
};

type ProductOption = {
  id: string;
  title: string;
  tariffs: Tariff[];
};

export type AdminUserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  avatarUrl: string | null;
  registrationLabel: string;
  _count: { enrollments: number; submissions: number };
  curatedProducts: { productId: string }[];
  enrollments: {
    productId: string;
    tariffId: string;
    tariff: { name: string };
  }[];
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Админ",
  CURATOR: "Куратор",
  USER: "Студент",
};

const ROLE_VARIANTS: Record<Role, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  CURATOR: "secondary",
  USER: "outline",
};

const ROLE_FILTER_OPTIONS: { value: Role; label: string }[] = [
  { value: "USER", label: "Студент" },
  { value: "CURATOR", label: "Куратор" },
  { value: "ADMIN", label: "Админ" },
];

const ADMIN_USERS_LIST_RESTORE_KEY = "admin-users-list-restore";

type RestorePayload = {
  role: Role;
  product: string;
  q: string;
  scrollY: number;
};

function buildUsersListQuery(
  role: Role,
  productId: string,
  q: string,
  viewer: "admin" | "curator",
) {
  const params = new URLSearchParams();
  if (viewer === "admin" && role !== "USER") params.set("role", role);
  if (productId) params.set("product", productId);
  const t = q.trim();
  if (t) params.set("q", t);
  return params.toString();
}

function matchesProductFilter(user: AdminUserListItem, productId: string | null) {
  if (!productId) return true;
  if (user.role === "ADMIN") return true;
  const enrolled = user.enrollments.some((e) => e.productId === productId);
  const curates = user.curatedProducts.some((c) => c.productId === productId);
  return enrolled || curates;
}

function matchesNameSearch(user: AdminUserListItem, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const name = (user.name ?? "").toLowerCase();
  const parts = normalizedQuery.split(/\s+/).filter(Boolean);
  return parts.every((p) => name.includes(p));
}

type Props = {
  users: AdminUserListItem[];
  products: ProductOption[];
  initialRole: Role;
  initialProductId: string;
  initialSearch: string;
  /** Куратор: только студенты, без админ-действий и без фильтра по роли в URL */
  viewer?: "admin" | "curator";
};

export const UsersListWithFilters = ({
  users,
  products,
  initialRole,
  initialProductId,
  initialSearch,
  viewer = "admin",
}: Props) => {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<Role>(initialRole);
  const [productId, setProductId] = useState<string>(initialProductId);
  const [search, setSearch] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const searchPending = deferredSearch !== search.trim().toLowerCase();

  useEffect(() => {
    if (viewer === "curator" && roleFilter !== "USER") {
      setRoleFilter("USER");
    }
  }, [viewer, roleFilter]);

  const firstRoleProductUrlEffect = useRef(true);
  const firstSearchUrlEffect = useRef(true);
  const filtersRef = useRef({ roleFilter, productId, search });
  filtersRef.current = { roleFilter, productId, search };

  useLayoutEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(ADMIN_USERS_LIST_RESTORE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let parsed: RestorePayload;
    try {
      parsed = JSON.parse(raw) as RestorePayload;
    } catch {
      try {
        sessionStorage.removeItem(ADMIN_USERS_LIST_RESTORE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    const urlHasFilters =
      initialSearch.trim() !== "" ||
      initialProductId !== "" ||
      (viewer === "admin" && initialRole !== "USER");

    if (!urlHasFilters) {
      setRoleFilter(viewer === "curator" ? "USER" : parsed.role);
      setProductId(parsed.product);
      setSearch(parsed.q);
      const qs = buildUsersListQuery(
        viewer === "curator" ? "USER" : parsed.role,
        parsed.product,
        parsed.q,
        viewer,
      );
      router.replace(`/admin/users${qs ? `?${qs}` : ""}`, { scroll: false });
    }

    try {
      sessionStorage.removeItem(ADMIN_USERS_LIST_RESTORE_KEY);
    } catch {
      /* ignore */
    }

    requestAnimationFrame(() => {
      window.scrollTo(0, parsed.scrollY);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при монтировании: URL из сервера + snapshot sessionStorage
  }, []);

  useEffect(() => {
    if (firstRoleProductUrlEffect.current) {
      firstRoleProductUrlEffect.current = false;
      return;
    }
    const { roleFilter: r, productId: p, search: s } = filtersRef.current;
    const qs = buildUsersListQuery(r, p, s, viewer);
    router.replace(`/admin/users${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [roleFilter, productId, router, viewer]);

  useEffect(() => {
    if (firstSearchUrlEffect.current) {
      firstSearchUrlEffect.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const { roleFilter: r, productId: p, search: s } = filtersRef.current;
      const qs = buildUsersListQuery(r, p, s, viewer);
      router.replace(`/admin/users${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [search, router, viewer]);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("role");
      setRoleFilter(
        viewer === "curator"
          ? "USER"
          : r === "ADMIN" || r === "CURATOR" || r === "USER"
            ? r
            : "USER",
      );
      setProductId(params.get("product") ?? "");
      setSearch(params.get("q") ?? "");
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [viewer]);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      if (user.role !== roleFilter) return false;
      if (!matchesProductFilter(user, productId || null)) return false;
      if (!matchesNameSearch(user, deferredSearch)) return false;
      return true;
    });
  }, [users, roleFilter, productId, deferredSearch]);

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:min-w-[220px]";

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
          tokens.radius.md,
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          {viewer === "admin" ? (
            <div className="space-y-2">
              <span className={tokens.typography.label} id="users-role-filter-label">
                Статус
              </span>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-labelledby="users-role-filter-label"
              >
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={roleFilter === opt.value ? "default" : "outline"}
                    onClick={() => setRoleFilter(opt.value)}
                    className="min-h-11"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <span className={tokens.typography.label}>Статус</span>
              <p className="text-sm text-muted-foreground">Только студенты</p>
            </div>
          )}

          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl lg:items-end">
            <div className="space-y-2">
              <label htmlFor="users-product-filter" className={tokens.typography.label}>
                Курс / марафон
              </label>
              <select
                id="users-product-filter"
                className={selectClass}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                aria-label="Фильтр по курсу или марафону"
              >
                <option value="">Все курсы и марафоны</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="users-search" className={tokens.typography.label}>
                Поиск по имени
              </label>
              <Input
                id="users-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Начните вводить имя или фамилию"
                autoComplete="off"
                className="w-full"
                aria-busy={searchPending}
              />
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Показано: {filtered.length} из {users.length}
        </p>
      </div>

      <div className={cn("space-y-3", searchPending && "opacity-80 transition-opacity duration-150")}>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Никто не подходит под выбранные фильтры.</p>
        ) : (
          filtered.map((user) => (
            <Card key={user.id}>
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-lg transition-colors hover:bg-accent/40"
                  onClick={() => {
                    const payload: RestorePayload = {
                      role: roleFilter,
                      product: productId,
                      q: search,
                      scrollY: window.scrollY,
                    };
                    try {
                      sessionStorage.setItem(ADMIN_USERS_LIST_RESTORE_KEY, JSON.stringify(payload));
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <Avatar>
                    <AvatarImage src={user.avatarUrl ?? undefined} />
                    <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 px-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{user.name ?? "Без имени"}</p>
                      <Badge variant={ROLE_VARIANTS[user.role]} className="text-xs">
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.role === "CURATOR"
                        ? `Назначено продуктов: ${user.curatedProducts.length} · ДЗ: ${user._count.submissions} · Регистрация: ${user.registrationLabel}`
                        : `Зачислений: ${user._count.enrollments} · ДЗ: ${user._count.submissions} · Регистрация: ${user.registrationLabel}`}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {viewer === "admin" ? (
                    <>
                      <UserRoleForm userId={user.id} currentRole={user.role} />
                      {user.role === "CURATOR" && (
                        <CuratorProductsForm
                          userId={user.id}
                          assignedProductIds={user.curatedProducts.map((item) => item.productId)}
                          products={products}
                        />
                      )}
                      {user.role === "USER" && (
                        <GrantAccessForm
                          userId={user.id}
                          products={products}
                          existingAccesses={user.enrollments.map((enrollment) => ({
                            productId: enrollment.productId,
                            tariffId: enrollment.tariffId,
                            tariffName: enrollment.tariff.name,
                          }))}
                        />
                      )}
                      <DeleteUserButton userId={user.id} userEmail={user.email} />
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
