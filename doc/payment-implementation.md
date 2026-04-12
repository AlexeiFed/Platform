# Техническая реализация оплаты (ЮMoney + запасной вебхук)

Документ описывает **как устроена оплата в этом репозитории**, чтобы перенести ту же модель в другое приложение. Чеклист переменных и настройки кошелька — в [`payment-external-setup.md`](./payment-external-setup.md).

---

## 1. Модель данных

Платёж хранится отдельно от зачисления на курс (`Enrollment`): сначала создаётся заявка, источник правды о деньгах — **вебхук** (ЮMoney или внешняя форма).

| Сущность | Назначение |
|----------|------------|
| `Payment` | Уникальный `reference` (номер заказа), сумма, статус `PENDING` → `SUCCEEDED` / `FAILED` / `CANCELLED`, опционально `yoomoneyOperationId` для идемпотентности повторов HTTP-уведомления. |
| `Enrollment` | Доступ к продукту; создаётся/обновляется **только после** успешного подтверждения оплаты в обработчике вебхука (или дублирующе при «Записаться», если оплата уже `SUCCEEDED`). |

Статусы: `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

Индексы/уникальность важны для переноса:

- `Payment.reference` — **уникален** (это поле `label` в QuickPay и ключ в вебхуках).
- `Payment.yoomoneyOperationId` — **уникален**, если заполняется (повторное уведомление с тем же `operation_id` → уже обработано).

---

## 2. Два сценария оплаты

### 2.1 Основной: QuickPay ЮMoney + HTTP-уведомление

**Условие:** на сервере задан `YOOMONEY_WALLET_RECEIVER` (номер кошелька).

**Поток:**

1. Пользователь авторизован → server action создаёт `Payment` со статусом `PENDING` и случайным `reference` (у нас `randomBytes(16).toString("hex")`), старые `PENDING` по тому же пользователю+продукту помечаются `CANCELLED`.
2. Клиент перенаправляется на страницу оплаты сайта: `/catalog/<slug>/oplatit?paymentRef=<reference>`.
3. Страница проверяет, что `paymentRef` принадлежит текущему пользователю и продукту, статус `PENDING`.
4. Рендерится HTML-форма с `method="POST"` и `action="https://yoomoney.ru/quickpay/confirm"` (официальный endpoint QuickPay).
5. Скрытые поля формы (минимум для кнопки):

   | Поле | Значение |
   |------|----------|
   | `receiver` | кошелёк из `YOOMONEY_WALLET_RECEIVER` |
   | `quickpay-form` | `button` |
   | `sum` | сумма из `Payment.amount` (строка с копейками) |
   | `label` | **`Payment.reference`** — критично: в уведомлении ЮMoney вернётся то же значение |
   | `successURL` | URL возврата на сайт после оплаты (у нас страница каталога с `?payment=yoomoney_ok`) |
   | `paymentType` | `AC` (карта) или `PC` (кошелёк) |

6. После зачисления перевода ЮMoney шлёт **сервер-сервер** `POST` на URL из кабинета кошелька (`…/api/payments/yoomoney-notification` или корень `…/api/payments`, если реализован алиас).

Документация ЮMoney: [уведомления](https://yoomoney.ru/docs/payment-buttons/using-api/notifications), [формы QuickPay](https://yoomoney.ru/docs/payment-buttons/using-api/forms).

### 2.2 Запасной: внешняя форма + JSON webhook

**Условие:** `YOOMONEY_WALLET_RECEIVER` **не** задан, в продукте указан `paymentFormUrl`.

1. Создаётся тот же `Payment` (`PENDING`, `reference`).
2. Пользователю открывается URL формы с добавленным query `paymentRef=<reference>` (идемпотентно через `URLSearchParams.set`).
3. Внешняя система (Make, сценарий формы и т.д.) после оплаты шлёт `POST` на ` /api/payments/form-webhook` с заголовком `x-platform-payment-secret` и телом JSON (см. раздел 5).

---

## 3. Проверка HTTP-уведомления ЮMoney (`sha1_hash`)

Тело запроса: **`application/x-www-form-urlencoded`** (как `URLSearchParams`).

Алгоритм (дословно как в коде `src/lib/yoomoney-notification-verify.ts`):

1. Взять `sha1_hash` из тела — строка из 40 hex-символов.
2. Собрать строку проверки (поля через **`&`**, отсутствующие — пустые строки):

   ```
   notification_type & operation_id & amount & currency & datetime & sender & codepro & <notificationSecret> & label
   ```

   - `codepro`: из тела; если значение `true` или `1`, в строку идёт литерал `true`, иначе `false`.
3. `digest = SHA1(строка)` в UTF-8, результат в **hex** (нижний регистр для сравнения с эталоном).
4. Сравнить `digest` с `sha1_hash` через **constant-time** сравнение буферов (защита от timing attacks).

Секрет `notificationSecret` — строка из кабинета ЮMoney («Секрет для проверки подлинности»), в приложении: `YOOMONEY_NOTIFICATION_SECRET`.

**Особый случай:** тест «Протестировать» в кабинете часто приходит **без `label`**. Логика: если подпись верна — ответ **200** и тело `OK` (заявку в БД не ищем).

**Если `label` есть:** найти `Payment` по `reference === label`, проверить статус `PENDING`, сумму (`withdraw_amount` если есть, иначе `amount` — согласовать с вашей логикой списания), обновить в транзакции: `SUCCEEDED`, сохранить `operation_id`, `rawPayload`, затем `upsert` записи на продукт (`Enrollment`).

Идемпотентность: если уже есть платёж с таким `yoomoneyOperationId` и `SUCCEEDED` — снова **200**, без ошибки.

---

## 4. HTTP-обработчик ЮMoney (поведение)

Файл: `src/app/api/payments/yoomoney-notification/route.ts`.

| Условие | HTTP |
|---------|------|
| Нет `YOOMONEY_NOTIFICATION_SECRET` | 503, тело `disabled` |
| Неверная подпись | 403, `bad hash` |
| Нет `label` (тест) | 200, `OK` |
| Нет `operation_id` / битая сумма | 400 |
| Нет платежа с таким `reference` | 404, `unknown label` |
| Сумма не совпадает с `Payment.amount` | 409 |
| Статус не `PENDING` | 409 |
| Успех | 200, `OK` |

После успеха вызывается инвалидация кэша страниц каталога/курса (`revalidatePath`).

Алиас пути: `src/app/api/payments/route.ts` реэкспортирует тот же `POST`/`GET`, если в кабинете указан короткий URL `/api/payments`.

---

## 5. Запасной webhook формы

`POST /api/payments/form-webhook`

- Заголовок: `x-platform-payment-secret: <PAYMENT_FORM_WEBHOOK_SECRET>` (сравнение длины + constant-time).
- JSON: обязательны сумма `amount` и одно из полей `reference` или `paymentRef` (значение = `Payment.reference`).
- Логика та же: найти `PENDING`, сверить сумму, `SUCCEEDED`, `Enrollment`, ответ `{ "ok": true }`.

---

## 6. Интеграция с авторизацией (важно для Next.js)

Вебхуки вызываются **без** сессии пользователя. Если глобальный `middleware` требует логин для всех путей кроме явного списка, запросы к `/api/payments/...` получат **редирект на логин** (у нас было **307** → ЮMoney считал ответ успешным по редиректу, а бизнес-логика не выполнялась).

**Правило переноса:** пути вебхуков (`/api/payments` и дочерние) должны быть в **публичном** списке middleware **или** исключены из matcher.

Текущая строка в `src/middleware.ts`: `pathname.startsWith("/api/payments")`.

---

## 7. Запись на курс после оплаты

- **Вебхук** при успехе делает `Enrollment` upsert сразу.
- Дополнительно server action `enrollToProduct`: если продукт платный, проверяет наличие `Payment` со статусом `SUCCEEDED` для пары user+product; если да — тоже делает upsert. Это закрывает гонку «вебхук ещё не дошёл» и кнопку «Проверить доступ».

Бесплатный продукт: зачисление без `Payment`.

---

## 8. Отмена незавершённой оплаты

Отдельный server action помечает `Payment` в `CANCELLED` по `reference` (кнопка «Оплату не завершил» на странице QuickPay), чтобы не копились вечные `PENDING`.

---

## 9. Минимальный чеклист для другого приложения

1. Таблица платежей с уникальным `reference` и статусами.
2. Создание `PENDING` до ухода на оплату; передача `reference` в ЮMoney как **`label`**.
3. Публичный HTTPS endpoint `POST`, разбор `application/x-www-form-urlencoded`, проверка **`sha1_hash`** по документации ЮMoney и вашему секрету.
4. Транзакция: обновление платежа + выдача доступа; идемпотентность по `operation_id`.
5. Вебхук **не** за middleware с обязательной сессией.
6. Опционально: второй канал подтверждения (JSON webhook + секрет в заголовке) для форм без прямого API ЮMoney.

---

## 10. Карта файлов в репозитории

| Компонент | Путь |
|-----------|------|
| Проверка `sha1_hash` | `src/lib/yoomoney-notification-verify.ts` |
| Суммы, платность, URL формы | `src/lib/product-payment.ts` |
| Создание платежа, редирект на оплату / форму | `src/app/(student)/catalog/[productSlug]/actions.ts` |
| Страница QuickPay, `successURL` | `src/app/(student)/catalog/[productSlug]/oplatit/page.tsx` |
| Форма POST на yoomoney.ru | `src/app/(student)/catalog/[productSlug]/oplatit/yoomoney-pay-form.tsx` |
| Webhook ЮMoney | `src/app/api/payments/yoomoney-notification/route.ts` |
| Алиас `/api/payments` | `src/app/api/payments/route.ts` |
| Webhook формы | `src/app/api/payments/form-webhook/route.ts` |
| Публичный доступ к вебхукам | `src/middleware.ts` |

---

*Версия документа соответствует коду на момент добавления файла; при изменении контрактов обновляйте разделы 3–5.*
