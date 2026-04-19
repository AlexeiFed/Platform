/**
 * measurement-fields.ts
 * Единый источник правды для полей замеров студента.
 * Используется в форме профиля и в карточке пользователя админа.
 */

export type MeasurementField = {
  key:
    | "shoulders"
    | "aboveChest"
    | "belowChest"
    | "waist"
    | "abdomen"
    | "hips"
    | "thighRight"
    | "thighLeft"
    | "calfRight"
    | "calfLeft"
    | "armRight"
    | "armLeft";
  label: string;
};

export const measurementFields: MeasurementField[] = [
  { key: "shoulders", label: "Плечи" },
  { key: "aboveChest", label: "Над грудью" },
  { key: "belowChest", label: "Под грудью" },
  { key: "waist", label: "Талия" },
  { key: "abdomen", label: "Живот" },
  { key: "hips", label: "Бёдра" },
  { key: "thighRight", label: "Бедро правое" },
  { key: "thighLeft", label: "Бедро левое" },
  { key: "calfRight", label: "Голень правая" },
  { key: "calfLeft", label: "Голень левая" },
  { key: "armRight", label: "Рука правая" },
  { key: "armLeft", label: "Рука левая" },
];
