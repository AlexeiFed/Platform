import { tokens } from "@/lib/design-tokens";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className={tokens.typography.h2}>Настройки</h1>
      <p className={tokens.typography.body}>
        Здесь позже появятся параметры платформы. Сейчас ключевые переменные задаются через <code className="text-sm">.env</code> на
        сервере.
      </p>
    </div>
  );
}
