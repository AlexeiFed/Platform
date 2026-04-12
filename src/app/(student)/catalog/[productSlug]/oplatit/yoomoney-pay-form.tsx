"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cancelPendingPaymentByReference } from "./actions";

const YOOMONEY_CONFIRM = "https://yoomoney.ru/quickpay/confirm";

type Props = {
  receiver: string;
  sum: string;
  label: string;
  successURL: string;
  productTitle: string;
  productSlug: string;
};

export const YooMoneyPayForm = ({
  receiver,
  sum,
  label,
  successURL,
  productTitle,
  productSlug,
}: Props) => {
  const router = useRouter();
  const [paymentType, setPaymentType] = useState<"AC" | "PC">("AC");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onCancel() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    const res = await cancelPendingPaymentByReference(label, productSlug);
    setBusy(false);
    if (res?.error) {
      setMsg(res.error);
      return;
    }
    router.push(`/catalog/${productSlug}`);
  }

  return (
    <div className="space-y-6 max-w-md">
      <p className={tokens.typography.body}>
        Перевод на кошелёк ЮMoney по курсу «{productTitle}». Сумма к списанию с вашего способа оплаты:{" "}
        <strong>{sum} ₽</strong> (как в каталоге; комиссия может удерживаться с получателя по правилам ЮMoney).
      </p>

      <form method="POST" action={YOOMONEY_CONFIRM} className="space-y-4">
        <input type="hidden" name="receiver" value={receiver} />
        <input type="hidden" name="quickpay-form" value="button" />
        <input type="hidden" name="sum" value={sum} />
        <input type="hidden" name="label" value={label} />
        <input type="hidden" name="successURL" value={successURL} />
        <input type="hidden" name="paymentType" value={paymentType} />

        <fieldset className="space-y-2">
          <legend className={`${tokens.typography.label} mb-2`}>Способ оплаты</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="paymentTypeRadio"
              checked={paymentType === "AC"}
              onChange={() => setPaymentType("AC")}
            />
            <span className="text-sm">Банковская карта</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="paymentTypeRadio"
              checked={paymentType === "PC"}
              onChange={() => setPaymentType("PC")}
            />
            <span className="text-sm">Кошелёк ЮMoney</span>
          </label>
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" disabled={busy}>
            Перейти к оплате в ЮMoney
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Оплату не завершил
          </Button>
        </div>
      </form>

      {msg ? <p className={`${tokens.typography.small} text-destructive`}>{msg}</p> : null}

      <p className={tokens.typography.small}>
        После успешного перевода ЮMoney пришлёт уведомление на сайт; затем нажмите «Проверить доступ» в карточке курса.
        Если вы уже закрыли окно ЮMoney без оплаты, нажмите «Оплату не завершил» — заявка снимется.
      </p>
    </div>
  );
};
