/**
 * header-slot.tsx
 * Контекст для инъекции произвольного контента в центральную часть Header.
 * Используется на страницах (напр. редактор курса), которым нужны табы в хедере.
 */
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type HeaderSlotCtx = {
  slot: ReactNode;
  setSlot: (node: ReactNode) => void;
};

const HeaderSlotContext = createContext<HeaderSlotCtx>({
  slot: null,
  setSlot: () => {},
});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlot() {
  return useContext(HeaderSlotContext);
}
