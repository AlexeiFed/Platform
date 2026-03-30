import { tokens } from "@/lib/design-tokens";
import { AssetManager } from "./asset-manager";

export default function AdminAssetsPage() {
  return (
    <div className="space-y-6">
      <h1 className={tokens.typography.h2}>Файлы</h1>
      <AssetManager />
    </div>
  );
}
