// Tiempos de entrega y condiciones comerciales del formato de cotización de Presservac.

export type DeliveryOption = { key: string; group: string; label: string; time: string };

export const DELIVERY_OPTIONS: DeliveryOption[] = [
  { key: "pape-gen-com", group: "Referencia PAPE genérico", label: "Comerciales", time: "Entrega inmediata" },
  { key: "pape-gen-nocom", group: "Referencia PAPE genérico", label: "No comerciales", time: "3 días hábiles" },
  { key: "lam-gen-bi", group: "Referencia laminada genérico", label: "Bilámina", time: "15 días hábiles" },
  { key: "lam-gen-tri", group: "Referencia laminada genérico", label: "Trilámina", time: "20 días hábiles" },
  { key: "pape-imp-rep", group: "Referencia PAPE impreso", label: "Repetición", time: "15 días hábiles" },
  { key: "pape-imp-new", group: "Referencia PAPE impreso", label: "Nueva - cambios", time: "25 días hábiles, después de aprobada la sherpa" },
  { key: "lam-imp-rep", group: "Referencia laminada impreso", label: "Repetición", time: "20 días hábiles" },
  { key: "lam-imp-new", group: "Referencia laminada impreso", label: "Nueva - cambios", time: "30 días hábiles, después de aprobada la sherpa" },
];

export const DEFAULT_PAYMENT_TERMS = "Anticipo 50/100";
export const DEFAULT_VALIDITY_DAYS = 30;
export const QUANTITY_TOLERANCE = "Tolerancia cantidad +/- 10%";
export const PRINT_CLAUSE =
  "El costo de los fotopolímeros, diseño y sherpa será asumido por el cliente; el valor puede variar de acuerdo a los ajustes que se confirmen una vez se tenga el arte final.";

export const STRUCTURE_LABEL: Record<string, string> = { PAPE: "PAPE", LAMINADO: "Laminado" };
export const BAG_TYPE_LABEL: Record<string, string> = { COJIN: "Cojín", DOYPACK: "Doypack", FLOWPACK: "Flowpack" };

/** Número de arranque: la última cotización del Excel fue la 4822. */
export const FIRST_QUOTATION_NUMBER = 4823;

/** Tiempos de entrega sugeridos según lo cotizado (estructura y si va impreso). */
export function suggestDeliveryKeys(items: { structure: string | null; printed: boolean }[]): string[] {
  const keys = new Set<string>();
  for (const i of items) {
    if (i.structure === "PAPE") keys.add(i.printed ? "pape-imp-new" : "pape-gen-nocom");
    if (i.structure === "LAMINADO") keys.add(i.printed ? "lam-imp-new" : "lam-gen-bi");
  }
  return DELIVERY_OPTIONS.map((o) => o.key).filter((k) => keys.has(k));
}

export const isPrintedName = (name: string) => /IMPRES/i.test(name);
