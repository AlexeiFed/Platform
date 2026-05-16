"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Bell, BellOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

type BannerVariant = "success" | "error" | "warning";

type Banner = {
  message: string;
  variant: BannerVariant;
};

const BANNER_DURATION_MS = 3200;

const bannerVariantClass: Record<BannerVariant, string> = {
  success: "border-emerald-500/35 bg-card",
  error: "border-destructive/40 bg-card",
  warning: "border-amber-500/40 bg-card",
};

const bannerIconClass: Record<BannerVariant, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
};

function PushNotificationBanner({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const Icon = banner.variant === "success" ? Check : banner.variant === "error" ? X : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 top-[4.5rem] z-[100] flex max-w-[min(calc(100vw-2rem),22rem)] -translate-x-1/2 items-start gap-2 border px-3 py-2.5 text-sm shadow-lg",
        tokens.radius.md,
        tokens.shadow.md,
        bannerVariantClass[banner.variant]
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", bannerIconClass[banner.variant])} aria-hidden />
      <p className="min-w-0 leading-snug">{banner.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Закрыть"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const PushNotificationsToggle = () => {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [mounted, setMounted] = useState(false);

  const showBanner = useCallback((message: string, variant: BannerVariant = "success") => {
    setBanner({ message, variant });
  }, []);

  const dismissBanner = useCallback(() => setBanner(null), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(sub));
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(dismissBanner, BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [banner, dismissBanner]);

  const toggle = useCallback(async () => {
    if (!supported || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/push/vapid-public");
      const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
      if (!data.configured || !data.publicKey) {
        showBanner("Push не настроен на сервере (VAPID-ключи)", "error");
        setLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        setSubscribed(false);
        showBanner("Уведомления отключены", "success");
        setLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showBanner("Разрешите уведомления в настройках браузера", "warning");
        setLoading(false);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      const json = sub.toJSON();
      if (!json.keys?.auth || !json.keys?.p256dh || !json.endpoint) {
        showBanner("Не удалось подключить уведомления", "error");
        setLoading(false);
        return;
      }
      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          expirationTime: json.expirationTime ?? null,
        }),
      });
      if (save.ok) {
        setSubscribed(true);
        showBanner("Уведомления включены — ДЗ и ответы куратора", "success");
      } else {
        showBanner("Не удалось сохранить подписку", "error");
      }
    } catch (e) {
      console.error("[PushNotificationsToggle]", e);
      showBanner("Не удалось изменить настройки", "error");
    }
    setLoading(false);
  }, [supported, loading, showBanner]);

  if (!supported) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={() => void toggle()}
        disabled={loading}
        aria-label={subscribed ? "Отключить push-уведомления" : "Включить push-уведомления"}
        title={subscribed ? "Отключить уведомления" : "Включить уведомления (ДЗ, ответы куратора)"}
      >
        {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      </Button>
      {mounted && banner
        ? createPortal(
            <PushNotificationBanner banner={banner} onDismiss={dismissBanner} />,
            document.body
          )
        : null}
    </>
  );
};
