# Live server (SFU) — встроенные эфиры

Это отдельный процесс, который держит WebRTC (SFU через `mediasoup`) и сигналинг через Socket.IO.

## Переменные окружения

- `LIVE_SERVER_PORT` (default: `4010`)
- `LIVE_SERVER_JWT_SECRET` — подпись токенов от Next.js
- `DATABASE_URL` — Postgres (для чтения/обновления статусов комнат/участников)
- `LIVE_RTC_MIN_PORT` (default: `40000`)
- `LIVE_RTC_MAX_PORT` (default: `49999`)
- `LIVE_ANNOUNCED_IP` — публичный IP сервера (важно для NAT)

## Запуск

```bash
npm run live:server
```

## TURN (обязательно)

Без TURN часть пользователей не подключится из “сложных” сетей.
Поднимай `coturn` на том же сервере и укажи ICE серверы в Next.js (см. env в приложении).

