/**
 * landing.ts
 * Общие типы блоков лендинга курса/марафона.
 * Используются в admin (landing-editor.tsx, actions.ts) и student (landing-renderer.tsx).
 */

export type LandingBlock =
  | { id: string; type: "hero"; title: string; subtitle: string; imageUrl: string }
  | { id: string; type: "heading"; level: 2 | 3; text: string }
  | { id: string; type: "text"; content: string }
  | { id: string; type: "features"; title: string; items: string[] }
  | { id: string; type: "image"; url: string; caption: string; fullWidth: boolean }
  | { id: string; type: "video"; url: string; title: string }
  | { id: string; type: "divider" };
