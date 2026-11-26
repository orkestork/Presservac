// Cálculo de precios de empaques al vacío, tomado del SIMULADOR (hojas PAPE y LAMINADO)
// y de la hoja de COTIZACIONES. Funciones puras: las usan la API, el simulador y el editor.

export type Structure = "PAPE" | "LAMINADO";
export type BagType = "COJIN" | "DOYPACK" | "FLOWPACK";

export type PricingConfig = {
  pape: {
    rollWidthCm: number;       // Rollo madre: medida (G3)
    rollWeightKg: number;      // Rollo madre: peso (G4)
    wastePct: number;          // Merma en unidades por kilo (8 %)
    firstRollNormal: number;   // Valor del primer rollo, bolsa NORMAL (D4)
    firstRollSmall: number;    // Valor del primer rollo, bolsa PEQUEÑA (D5)
    extraKgNormal: number;     // Valor de cada kilo adicional, NORMAL (E4)
    extraKgSmall: number;      // Valor de cada kilo adicional, PEQUEÑA (E5)
    largeFirstKg: number;      // Bolsa GRANDE: valor kilo primera escala (D3)
    largeNextKg: number;       // Bolsa GRANDE: valor kilo segunda escala (E3)
    maxScaleKg: number;        // Escalas visibles hasta estos kilos (166)
    afterKg: number;           // Valor kilo "después de" (31.500)
    smallWidthCm: number;      // Ancho menor a esto = PEQUEÑA (11)
    largeOpenLengthCm: number; // Largo×2 mayor a esto = GRANDE (59)
  };
  laminado: {
    wastePct: number;                              // Merma (12 %)
    scales: { kg: number; pricePerKg: number }[];  // Escalas por kilos
  };
  zipperPerCm: number;  // Zipper: valor por cm de ancho (3)
  valve: number;        // Postura de válvula por unidad (50)
  photopolymerCm2: number; // Fotopolímero: valor por cm² (145–170)
};

export const DEFAULT_PRICING: PricingConfig = {
  pape: {
    rollWidthCm: 120,
    rollWeightKg: 200,
    wastePct: 8,
    firstRollNormal: 4_100_000,
    firstRollSmall: 4_100_000,
    extraKgNormal: 19_500,
    extraKgSmall: 22_000,
    largeFirstKg: 41_000,
    largeNextKg: 33_500,
    maxScaleKg: 166,
    afterKg: 31_500,
    smallWidthCm: 11,
    largeOpenLengthCm: 59,
  },
  laminado: {
    wastePct: 12,
    scales: [
      { kg: 50, pricePerKg: 80_000 },
      { kg: 100, pricePerKg: 60_000 },
      { kg: 200, pricePerKg: 37_500 },
      { kg: 300, pricePerKg: 30_000 },
    ],
  },
  zipperPerCm: 3,
  valve: 50,
  photopolymerCm2: 145,
};

export type BagSpec = {
  structure: Structure;
  bagType: BagType;
  widthCm: number;
  lengthCm: number;
  microns: number;
  gussetCm?: number;
  zipper?: boolean;
  valve?: boolean;
};

export type ScaleRow = {
  label: string;        // "1", "2", … o "Después de"
  kilos: number;
  pricePerKg: number;
  quantity: number;     // Cantidad aproximada (redondeada al millar hacia arriba)
  unitPrice: number;    // Valor unitario sin IVA
  total: number;        // Valor total sin IVA
};

export type SimulationResult = {
  sizeClass?: "GRANDE" | "NORMAL" | "PEQUEÑA";
  unitWeightG: number;
  unitsPerKg: number;
  rollKg?: number;
  extrasPerUnit: number;
  rows: ScaleRow[];
};

const roundUpThousand = (n: number) => Math.ceil(n / 1000) * 1000;

/** Peso de una bolsa en gramos (fórmula de la hoja LAMINADO; en PAPE siempre es cojín). */
export function unitWeightG(spec: Pick<BagSpec, "bagType" | "widthCm" | "lengthCm" | "microns" | "gussetCm">): number {
  const a = spec.widthCm, l = spec.lengthCm, m = spec.microns, f = spec.gussetCm ?? 0;
  switch (spec.bagType) {
    case "DOYPACK": return (a / 100) * ((l + f / 2) / 100) * 2 * m;
    case "FLOWPACK": return ((a + (f * 2 + 1)) / 100) * ((l / 100) * 2 * m);
    default: return (a / 100) * ((l / 100) * 2 * m);
  }
}

export function extrasPerUnit(spec: Pick<BagSpec, "widthCm" | "zipper" | "valve">, cfg: PricingConfig): number {
  return (spec.zipper ? cfg.zipperPerCm * spec.widthCm : 0) + (spec.valve ? cfg.valve : 0);
}

export function papeSizeClass(widthCm: number, lengthCm: number, cfg: PricingConfig): "GRANDE" | "NORMAL" | "PEQUEÑA" {
  if (lengthCm * 2 > cfg.pape.largeOpenLengthCm) return "GRANDE";
  if (widthCm < cfg.pape.smallWidthCm) return "PEQUEÑA";
  return "NORMAL";
}

function row(label: string, kilos: number, pricePerKg: number, unitsPerKg: number, extras: number, ceilUnit: boolean): ScaleRow {
  const quantity = roundUpThousand(unitsPerKg * kilos);
  const raw = pricePerKg / unitsPerKg + extras;
  const unitPrice = ceilUnit ? Math.ceil(raw) : Math.round(raw);
  return { label, kilos, pricePerKg, quantity, unitPrice, total: quantity * unitPrice };
}

/** Hoja PAPE: precio por rollo madre, escalas de 1 a 5 rollos (hasta maxScaleKg) y "después de". */
export function simulatePape(spec: BagSpec, cfg: PricingConfig): SimulationResult {
  const p = cfg.pape;
  const weight = unitWeightG({ ...spec, bagType: "COJIN", gussetCm: 0 });
  const unitsPerKg = (1000 / weight) * (1 - p.wastePct / 100);
  const rollKg = (spec.lengthCm * 2 * p.rollWeightKg) / p.rollWidthCm;
  const size = papeSizeClass(spec.widthCm, spec.lengthCm, cfg);
  const extras = extrasPerUnit(spec, cfg);
  const firstRoll = size === "PEQUEÑA" ? p.firstRollSmall : p.firstRollNormal;
  const extraKg = size === "PEQUEÑA" ? p.extraKgSmall : p.extraKgNormal;

  const rows: ScaleRow[] = [];
  for (let n = 1; n <= 5; n++) {
    const kilos = rollKg * n;
    if (kilos > p.maxScaleKg) break;
    let perKg: number;
    if (size === "GRANDE") {
      if (n > 2) break; // la hoja solo tiene dos escalas para bolsa grande
      perKg = n === 1 ? p.largeFirstKg : p.largeNextKg;
    } else {
      perKg = (firstRoll + (kilos - rollKg) * extraKg) / kilos;
    }
    rows.push(row(String(n), kilos, perKg, unitsPerKg, extras, true));
  }
  // "Después de": el primer múltiplo de rollo que supera el tope de escalas.
  const afterKilos = Math.ceil((p.maxScaleKg + 0.0001) / rollKg) * rollKg;
  rows.push(row("Después de", afterKilos, p.afterKg, unitsPerKg, extras, true));

  return { sizeClass: size, unitWeightG: weight, unitsPerKg, rollKg, extrasPerUnit: extras, rows };
}

/** Hoja LAMINADO: escalas fijas por kilos con su valor kilo. */
export function simulateLaminado(spec: BagSpec, cfg: PricingConfig): SimulationResult {
  const weight = unitWeightG(spec);
  const unitsPerKg = (1000 / weight) * (1 - cfg.laminado.wastePct / 100);
  const extras = extrasPerUnit(spec, cfg);
  const rows = cfg.laminado.scales.map((s) => row(`${s.kg} kg`, s.kg, s.pricePerKg, unitsPerKg, extras, true));
  return { unitWeightG: weight, unitsPerKg, extrasPerUnit: extras, rows };
}

export function simulate(spec: BagSpec, cfg: PricingConfig): SimulationResult {
  return spec.structure === "LAMINADO" ? simulateLaminado(spec, cfg) : simulatePape(spec, cfg);
}

/**
 * Línea de la hoja de cotización: el comercial pone kilos, valor kilo y merma, y sale el
 * valor unitario (columnas P–Y del formato de COTIZACIONES).
 */
export type LineCalcInput = {
  bagType?: string | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  microns?: number | null;
  gussetCm?: number | null;
  kilos?: number | null;
  pricePerKg?: number | null;
  wastePct?: number | null;
  zipper?: boolean | null;
  zipperPerCm?: number | null;
};

export function calcLineByKg(i: LineCalcInput): { unitWeightG: number; unitsPerKg: number; approxQty: number | null; unitPrice: number } | null {
  if (!i.widthCm || !i.microns || !i.pricePerKg) return null;
  const a = i.widthCm, m = i.microns, f = i.gussetCm ?? 0;
  // Sin largo la hoja asume 50 cm (rollo).
  const weight = !i.lengthCm
    ? a * 50 * 2 * 0.0001 * m
    : i.bagType === "FLOWPACK"
      ? (a + f) * (i.lengthCm * 2 * 0.0001 * m)
      : i.bagType === "DOYPACK"
        ? a * ((i.lengthCm + f / 2) * 2 * 0.0001 * m)
        : a * (i.lengthCm * 2 * 0.0001 * m);
  if (!(weight > 0)) return null;
  const unitsPerKg = (1000 / weight) * (1 - (i.wastePct ?? 0) / 100);
  const zip = i.zipper ? (i.zipperPerCm ?? 0) * a : 0;
  const unitPrice = Math.ceil(i.pricePerKg / unitsPerKg + zip);
  const approxQty = i.kilos ? roundUpThousand(i.kilos * unitsPerKg) : null;
  return { unitWeightG: weight, unitsPerKg, approxQty, unitPrice };
}

/** Fotopolímeros: (largo×2×pistas + 2) × (ancho×repeticiones + 2) × valor cm². Tapa usa otra orientación. */
export function calcPhotopolymer(input: {
  widthCm: number; lengthCm: number; tracks: number; repeats: number; pricePerCm2: number; isLid?: boolean;
}): { widthCm: number; heightCm: number; value: number; approx: number } {
  const { widthCm: a, lengthCm: l, tracks, repeats, pricePerCm2, isLid } = input;
  const w = isLid ? a + 2 : l * 2 * tracks + 2;
  const h = isLid ? l * repeats + 2 : a * repeats + 2;
  const value = w * h * pricePerCm2;
  return { widthCm: w, heightCm: h, value, approx: Math.ceil(value / 10_000) * 10_000 };
}

/** Mezcla segura de una configuración guardada con los valores por defecto. */
export function mergePricing(raw: unknown): PricingConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PricingConfig>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const pape = { ...DEFAULT_PRICING.pape };
  for (const k of Object.keys(pape) as (keyof PricingConfig["pape"])[]) pape[k] = num(r.pape?.[k], pape[k]);
  const scales = Array.isArray(r.laminado?.scales) && r.laminado!.scales.length > 0
    ? r.laminado!.scales
        .map((s) => ({ kg: num(s?.kg, 0), pricePerKg: num(s?.pricePerKg, 0) }))
        .filter((s) => s.kg > 0 && s.pricePerKg > 0)
        .sort((x, y) => x.kg - y.kg)
    : DEFAULT_PRICING.laminado.scales;
  return {
    pape,
    laminado: { wastePct: num(r.laminado?.wastePct, DEFAULT_PRICING.laminado.wastePct), scales: scales.length ? scales : DEFAULT_PRICING.laminado.scales },
    zipperPerCm: num(r.zipperPerCm, DEFAULT_PRICING.zipperPerCm),
    valve: num(r.valve, DEFAULT_PRICING.valve),
    photopolymerCm2: num(r.photopolymerCm2, DEFAULT_PRICING.photopolymerCm2),
  };
}

/**
 * Valor unitario para una cantidad libre: se usa la escala más alta que la cantidad alcanza
 * (por debajo de la primera escala, el precio de la primera).
 */
export function priceForQuantity(rows: ScaleRow[], quantity: number): ScaleRow | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.quantity - b.quantity);
  let pick = sorted[0];
  for (const r of sorted) if (quantity >= r.quantity) pick = r;
  return pick;
}
