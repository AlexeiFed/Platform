"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import {
  createMessengerLink,
  disconnectMessengerChannel,
  getNotificationSettings,
  setEmailNotificationsEnabled,
  type NotificationSettings,
} from "@/lib/notification-channels/actions";
import type { NotificationChannelType } from "@prisma/client";
import { MAX_MESSENGER_CONNECT_ENABLED } from "@/lib/notification-channels/constants";

type ChannelCardProps = {
  title: string;
  description: string;
  connected: boolean;
  configured: boolean;
  borderClass: string;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

function ChannelCard({
  title,
  description,
  connected,
  configured,
  borderClass,
  loading,
  onConnect,
  onDisconnect,
}: ChannelCardProps) {
  return (
    <div className={cn("border p-3", tokens.radius.md, borderClass)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {connected ? (
          <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Подключено
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        {!configured ? (
          <p className="text-xs text-muted-foreground">Бот не настроен на сервере</p>
        ) : connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loading}
            onClick={onDisconnect}
          >
            Отключить
          </Button>
        ) : (
          <Button type="button" size="sm" className="w-full" disabled={loading} onClick={onConnect}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Подключить"}
          </Button>
        )}
      </div>
    </div>
  );
}

export const NotificationBell = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadingChannel, setLoadingChannel] = useState<NotificationChannelType | null>(null);
  const [emailPending, startEmailTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxNotice, setMaxNotice] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await getNotificationSettings();
    if (res.success && res.data) {
      setSettings(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error ?? "Ошибка загрузки");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadSettings();
    router.refresh();
  }, [open, loadSettings, router]);

  const hasActiveChannel =
    Boolean(settings?.telegram.connected) ||
    Boolean(settings?.max.connected) ||
    Boolean(settings?.emailEnabled);

  const handleConnect = async (type: NotificationChannelType) => {
    if (type === "MAX" && !MAX_MESSENGER_CONNECT_ENABLED) {
      setLoadError(null);
      setMaxNotice("Интеграция с MAX в разработке. Скоро можно будет подключить уведомления в мессенджере.");
      return;
    }

    setLoadingChannel(type);
    setLoadError(null);
    setMaxNotice(null);
    const res = await createMessengerLink(type);
    setLoadingChannel(null);
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    setLoadError(res.error ?? "Не удалось создать ссылку");
  };

  const handleDisconnect = async (type: NotificationChannelType) => {
    setLoadingChannel(type);
    setLoadError(null);
    const res = await disconnectMessengerChannel(type);
    setLoadingChannel(null);
    if (res.success) {
      await loadSettings();
    } else {
      setLoadError(res.error ?? "Не удалось отключить");
    }
  };

  const handleEmailToggle = (enabled: boolean) => {
    startEmailTransition(async () => {
      const res = await setEmailNotificationsEnabled(enabled);
      if (res.success) {
        setSettings((prev) => (prev ? { ...prev, emailEnabled: enabled } : prev));
        setLoadError(null);
      } else {
        setLoadError(res.error ?? "Не удалось сохранить");
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Настройки уведомлений"
          title="Уведомления"
        >
          {hasActiveChannel ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("w-80 p-0", tokens.radius.md)}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Уведомления</p>
          <p className="text-xs text-muted-foreground">ДЗ, ответы куратора, сообщения</p>
        </div>

        <div className="space-y-3 p-4">
          {maxNotice ? (
            <p
              className={cn(
                "border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-900 dark:text-amber-100",
                tokens.radius.md
              )}
              role="status"
            >
              {maxNotice}
            </p>
          ) : null}
          {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}

          {settings ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Email</p>
                  <p className="truncate text-xs text-muted-foreground">{settings.email}</p>
                </div>
                <Switch
                  checked={settings.emailEnabled}
                  disabled={emailPending}
                  onCheckedChange={handleEmailToggle}
                  aria-label="Уведомления на email"
                />
              </div>

              <ChannelCard
                title="Telegram"
                description="Мгновенные уведомления в боте"
                connected={settings.telegram.connected}
                configured={settings.telegram.configured}
                borderClass="border-sky-500/25 bg-sky-500/5"
                loading={loadingChannel === "TELEGRAM"}
                onConnect={() => void handleConnect("TELEGRAM")}
                onDisconnect={() => void handleDisconnect("TELEGRAM")}
              />

              <ChannelCard
                title="Мессенджер MAX"
                description={
                  MAX_MESSENGER_CONNECT_ENABLED
                    ? "Уведомления в национальной платформе"
                    : "Скоро — подключение уведомлений в MAX"
                }
                connected={settings.max.connected}
                configured={MAX_MESSENGER_CONNECT_ENABLED ? settings.max.configured : true}
                borderClass="border-emerald-500/25 bg-emerald-500/5"
                loading={loadingChannel === "MAX"}
                onConnect={() => void handleConnect("MAX")}
                onDisconnect={() => void handleDisconnect("MAX")}
              />
            </>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
