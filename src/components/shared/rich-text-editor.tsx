/**
 * rich-text-editor.tsx
 * Простой редактор с поддержкой markdown-форматирования, emoji picker и отступов.
 * Контент хранится как plain markdown текст.
 * Поддерживает: жирный, курсив, заголовок, списки, красную строку (Tab), эмодзи.
 */
"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Indent,
  Smile,
} from "lucide-react";

// === Категории эмодзи ===

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Смайлы": [
    "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
    "🙂","😍","🥰","😘","😋","😜","🤔","😑","😤","😢",
    "😭","🥳","🤩","😎","🤓","😴","🤒","🤕","😤","😏",
  ],
  "Жест": [
    "👍","👎","👌","✌️","🤞","🤟","🤙","💪","🙌","👏",
    "🙏","🤝","✋","🖐️","👋","🤚","👆","👇","👉","👈",
  ],
  "Активность": [
    "🏃","🚶","🧘","🤸","🏋️","🤾","🚴","🏊","⚽","🏀",
    "🎯","🏆","🥇","🎉","✨","🔥","💯","⭐","🌟","💥",
  ],
  "Питание": [
    "🍎","🥦","🥕","🍗","🥗","🍱","🥩","🥑","🍇","🍓",
    "🫐","🍊","🍋","🍌","🥝","🍅","🫑","🧄","🧅","🫒",
  ],
  "Символы": [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","♾️","✅",
    "❌","⚠️","💡","📌","📍","🔑","🎁","📚","📖","✏️",
  ],
};

// === Типы ===

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  id?: string;
};

// === Компонент ===

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "120px",
  className,
  id,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState("Смайлы");

  // Вставка текста с обёрткой выделения (напр. **bold**)
  const insertAtCursor = useCallback(
    (before: string, after = "") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      const newVal =
        value.slice(0, start) + before + selected + after + value.slice(end);
      onChange(newVal);
      // Восстанавливаем позицию курсора после обновления
      requestAnimationFrame(() => {
        ta.focus();
        const cursor = start + before.length + selected.length;
        ta.setSelectionRange(cursor, cursor);
      });
    },
    [value, onChange]
  );

  // Вставка/удаление префикса строки (напр. "- " для списка)
  const toggleLinePrefix = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const hasPrefix = value.slice(lineStart).startsWith(prefix);
      let newVal: string;
      if (hasPrefix) {
        newVal =
          value.slice(0, lineStart) + value.slice(lineStart + prefix.length);
      } else {
        newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      }
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.focus();
      });
    },
    [value, onChange]
  );

  // Tab = красная строка (4 NBSP — не влияет на markdown-разметку как code block)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("\u00A0\u00A0\u00A0\u00A0");
    }
  }

  return (
    <div className={cn("rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Жирный (выделите текст)"
          onClick={() => insertAtCursor("**", "**")}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Курсив (выделите текст)"
          onClick={() => insertAtCursor("*", "*")}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Заголовок"
          onClick={() => toggleLinePrefix("## ")}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Маркированный список"
          onClick={() => toggleLinePrefix("- ")}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Нумерованный список"
          onClick={() => toggleLinePrefix("1. ")}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Красная строка / отступ (также клавиша Tab)"
          onClick={() => insertAtCursor("\u00A0\u00A0\u00A0\u00A0")}
        >
          <Indent className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          variant={showEmoji ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          title="Вставить эмодзи"
          onClick={() => setShowEmoji((v) => !v)}
        >
          <Smile className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Emoji Picker */}
      {showEmoji && (
        <div className="border-b border-input bg-muted/30 p-2">
          {/* Категории */}
          <div className="mb-2 flex flex-wrap gap-1">
            {Object.keys(EMOJI_CATEGORIES).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setEmojiCategory(cat)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  emojiCategory === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Сетка эмодзи */}
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {EMOJI_CATEGORIES[emojiCategory]?.map((emoji, idx) => (
              <button
                key={`${emojiCategory}-${idx}`}
                type="button"
                title={emoji}
                onClick={() => {
                  insertAtCursor(emoji);
                  setShowEmoji(false);
                }}
                className="text-lg leading-none transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Textarea */}
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ minHeight }}
        className="w-full resize-y bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
      />
    </div>
  );
}
