"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const toggle = useCallback(async () => {
    if (!supported || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/push/vapid-public");
      const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
      if (!data.configured || !data.publicKey) {
        window.alert("На сервере не заданы VAPID-ключи для push (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
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
        setLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      const json = sub.toJSON();
      if (!json.keys?.auth || !json.keys?.p256dh || !json.endpoint) {
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
      if (save.ok) setSubscribed(true);
    } catch (e) {
      console.error("[PushNotificationsToggle]", e);
    }
    setLoading(false);
  }, [supported, loading]);

  if (!supported) return null;

  return (
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
  );
};
