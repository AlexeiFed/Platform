/** Каталог в S3: `courses/{productId}/additional-materials/{uuid}` без завершающего `/`. */
export function materialStorageDirFromFileKey(fileKey: string): string | null {
  const i = fileKey.lastIndexOf("/");
  if (i <= 0) return null;
  return fileKey.slice(0, i);
}

/** Все ключи страниц лежат в `{dir}/pages/…`. */
export function assertPreviewPageKeysUnderMaterial(fileKey: string, pageKeys: string[]): boolean {
  const dir = materialStorageDirFromFileKey(fileKey);
  if (!dir || pageKeys.length === 0) return false;
  const prefix = `${dir}/pages/`;
  return pageKeys.every((k) => k.startsWith(prefix) && !k.includes(".."));
}
