/**
 * course-editor-shell.tsx
 * Клиент-обёртка редактора курса/марафона.
 * Управляет активным табом, инжектирует таб-плашки в Header через HeaderSlotContext.
 * Каждый раздел рендерится всегда (hidden = display:none) — состояние не теряется.
 */
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useHeaderSlot } from "@/lib/header-slot";
import { TariffsAndCriteriaEditor } from "./tariffs-and-criteria-editor";
import { CourseEditor } from "./course-editor";
import { BulkProceduresManager } from "./bulk-procedures-manager";
import type { ProductCriterion, ProductType } from "@prisma/client";
import type { LandingBlock } from "@/types/landing";

// === Types (дублируют page.tsx для прокидывания в дочерние компоненты) ===

type SerializedTariff = {
  id: string;
  name: string;
  price: number;
  currency: string;
  sortOrder: number;
  published: boolean;
  criteria: ProductCriterion[];
};

type Props = {
  product: {
    id: string;
    type: ProductType;
    title: string;
    slug: string;
    description: string | null;
    rules: string | null;
    coverUrl: string | null;
    price: number | null;
    currency: string;
    paymentFormUrl: string | null;
    published: boolean;
    startDate: string | null;
    durationDays: number | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    enabledCriteria: ProductCriterion[];
    landingBlocks: LandingBlock[];
  };
  lessons: Parameters<typeof CourseEditor>[0]["lessons"];
  marathonEvents: Parameters<typeof CourseEditor>[0]["marathonEvents"];
  tariffs: SerializedTariff[];
};

// === Типы табов ===
type TabId = "criteria" | "description" | "rules" | "schedule" | "landing" | "lessons" | "procedures";

type Tab = { id: TabId; label: string };

// === Компонент таб-плашек для инъекции в Header ===
function TabPills({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// === Shell ===
export function CourseEditorShell({ product, lessons, marathonEvents, tariffs }: Props) {
  const storageKey = `editor-tab-${product.id}`;
  const [activeTab, setActiveTab] = useState<TabId>("criteria");
  const { setSlot } = useHeaderSlot();

  // Восстанавливаем последнюю вкладку после монтирования
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setActiveTab(saved as TabId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Смена вкладки с сохранением в localStorage */
  function handleSetTab(id: TabId) {
    setActiveTab(id);
    localStorage.setItem(storageKey, id);
  }

  const tabs: Tab[] = [
    { id: "criteria", label: "Критерии" },
    { id: "description", label: "Описание" },
    { id: "rules", label: "Правила" },
    { id: "landing", label: "Лендинг" },
    { id: "lessons", label: "Уроки" },
    ...(product.type === "MARATHON"
      ? ([
          { id: "schedule", label: "Расписание" },
          { id: "procedures", label: "Процедуры" },
        ] as Tab[])
      : []),
  ];

  // Инжектируем таб-плашки в хедер при монтировании / смене таба, очищаем при анмаунте
  useEffect(() => {
    setSlot(
      <TabPills tabs={tabs} active={activeTab} onChange={handleSetTab} />,
    );
    return () => setSlot(null);
    // tabs зависит от product.type и activeTab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, product.type]);

  return (
    <div className="space-y-6">
      {/* Критерии и тарифы */}
      <div className={activeTab !== "criteria" ? "hidden" : undefined}>
        <TariffsAndCriteriaEditor
          productId={product.id}
          initialEnabled={product.enabledCriteria}
          tariffs={tariffs}
        />
      </div>

      {/* Процедуры марафона — массовое назначение */}
      {product.type === "MARATHON" && (
        <div className={activeTab !== "procedures" ? "hidden" : undefined}>
          <BulkProceduresManager productId={product.id} />
        </div>
      )}

      {/* Описание, Правила, Расписание, Лендинг, Уроки — управляет CourseEditor */}
      <CourseEditor
        product={product}
        lessons={lessons}
        marathonEvents={marathonEvents}
        activeTab={activeTab}
        onRequestTab={(tab) => handleSetTab(tab as TabId)}
      />
    </div>
  );
}
