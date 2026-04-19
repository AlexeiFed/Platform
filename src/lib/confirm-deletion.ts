/**
 * Подтверждение удаления в UI перед вызовом server action.
 * Все сценарии удаления данных из интерфейса должны проходить через эту функцию.
 */
export function confirmDeletion(message: string): boolean {
  return typeof window !== "undefined" && window.confirm(message);
}
