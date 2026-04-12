/** Продукт считается платным, если цена задана и строго больше нуля. */
export function isPaidProduct(price: { toString(): string } | null | undefined): boolean {
  return price != null && Number(price) > 0;
}

/** Добавляет query-параметр `paymentRef` к URL формы (идемпотентно перезаписывает тот же ключ). */
export function appendPaymentRefToFormUrl(formUrl: string, paymentRef: string): string {
  const url = new URL(formUrl);
  url.searchParams.set("paymentRef", paymentRef);
  return url.toString();
}

/** Сравнение денежных сумм с учётом Decimal / number / string. */
export function amountsEqual(a: { toString(): string } | number | string, b: { toString(): string } | number | string): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) < 0.005;
}
