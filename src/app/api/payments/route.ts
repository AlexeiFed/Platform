/**
 * Совместимость: в кабинете ЮMoney часто указывают короткий URL `/api/payments`.
 * Основной путь — `/api/payments/yoomoney-notification` (см. doc/payment-external-setup.md).
 */
export { GET, POST } from "./yoomoney-notification/route";
