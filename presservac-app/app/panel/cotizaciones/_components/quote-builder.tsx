"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calcPhotopolymer, DEFAULT_PRICING, priceForQuantity, simulate,
  type BagType, type PricingConfig, type ScaleRow, type Structure,
} from "@/lib/bag-pricing";
import {
  BAG_TYPE_LABEL, DEFAULT_PAYMENT_TERMS, DELIVERY_OPTIONS, isPrintedName, PRINT_CLAUSE, QUANTITY_TOLERANCE, suggestDeliveryKeys,
} from "@/lib/quotation-terms";

const fmt = (n: number) =>
  (n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const num = (n: number, d = 0) => (n || 0).toLocaleString("es-CO", { maximumFractionDigits: d });
const parse = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };

const input =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#051C46] focus:ring-2 focus:ring-[#051C46]/10";
const label = "mb-1 block text-xs font-semibold text-[#64748B]";

export type BuilderItem = {
  key: string;
  kind: "bag" | "photo" | "other";
  name: string;
  reference: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  structure: string | null;
  bagType: string | null;
  widthCm: number | null;
  lengthCm: number | null;
  microns: number | null;
  gussetCm: number | null;
  zipper: boolean;
  valve: boolean;
  printed: boolean;
  kilos: number | null;
  pricePerKg: number | null;
  wastePct: number | null;
  zipperPerCm: number | null;
};

export type BuilderClient = {
  clientId: string | null;
  clientName: string;
  clientNit: string;
  clientAddress: string;
  clientCity: string;
  clientContact: string;
  clientEmail: string;
  clientPhone: string;
};

export type BuilderInitial = BuilderClient & {
  id?: string;
  number?: string;
  items: BuilderItem[];
  deliveryKeys: string[];
  printClause: boolean;
  paymentTerms: string;
  validUntil: string;
  notes: string;
};

type Client = { id: string; fullName: string; company: string | null; email: string; city: string | null; phone: string | null; addressLine1: string | null };

let seq = 0;
const newKey = () => `k${Date.now()}-${seq++}`;

/** Convierte una cotización del API en el estado de la pantalla. */
export function toBuilderInitial(q: {
  id: string; number: string; clientId: string | null; clientName: string; clientNit: string | null; clientAddress: string | null;
  clientCity: string | null; clientContact: string | null; clientEmail: string | null; clientPhone: string | null;
  deliveryKeys: string[]; printClause: boolean; paymentTerms: string | null; validUntil: string | null; notes: string | null;
  items: (Omit<BuilderItem, "key" | "kind" | "printed" | "reference"> & { reference: string | null })[];
}, asCopy = false): BuilderInitial {
  return {
    ...(asCopy ? {} : { id: q.id, number: q.number }),
    clientId: q.clientId, clientName: q.clientName, clientNit: q.clientNit ?? "", clientAddress: q.clientAddress ?? "",
    clientCity: q.clientCity ?? "", clientContact: q.clientContact ?? "", clientEmail: q.clientEmail ?? "", clientPhone: q.clientPhone ?? "",
    deliveryKeys: q.deliveryKeys, printClause: q.printClause, paymentTerms: q.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
    validUntil: asCopy || !q.validUntil ? "" : q.validUntil.slice(0, 10), notes: q.notes ?? "",
    items: q.items.map((i) => ({
      ...i,
      key: newKey(),
      reference: i.reference ?? "",
      kind: i.structure ? "bag" : /FOTOPOL/i.test(i.name) ? "photo" : "other",
      printed: isPrintedName(i.name),
    })),
  };
}

const EMPTY_CLIENT: BuilderClient = {
  clientId: null, clientName: "", clientNit: "", clientAddress: "", clientCity: "", clientContact: "", clientEmail: "", clientPhone: "",
};

function Pill({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-bold transition disabled:opacity-40 ${
        active ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#051C46]"
      }`}
    >
      {children}
    </button>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D60517] text-sm font-black text-white">{n}</span>
      <div>
        <h2 className="text-base font-black text-[#051C46]">{title}</h2>
        {hint && <p className="text-xs text-[#94A3B8]">{hint}</p>}
      </div>
    </div>
  );
}

/** Campo numérico de la lista de la derecha: edita en vivo, sin guardar campo por campo. */
function MiniNum({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
  const [local, setLocal] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setLocal(String(value)); }
  return (
    <input
      inputMode="numeric"
      value={local}
      onChange={(e) => { setLocal(e.target.value); const n = parse(e.target.value); if (n) onChange(Math.round(n)); }}
      onBlur={() => setLocal(String(value))}
      className={`rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-right text-sm outline-none focus:border-[#051C46] ${className ?? ""}`}
    />
  );
}

export function describeItem(i: Pick<BuilderItem, "structure" | "bagType" | "widthCm" | "lengthCm" | "microns" | "gussetCm" | "zipper" | "valve" | "printed">) {
  if (!i.structure) return "";
  const parts = [
    `${i.structure === "LAMINADO" ? "Laminado" : "PAPE"} ${BAG_TYPE_LABEL[i.bagType ?? "COJIN"]?.toLowerCase() ?? ""}`.trim(),
    i.widthCm && i.lengthCm ? `${num(i.widthCm, 1)} × ${num(i.lengthCm, 1)} cm` : null,
    i.microns ? `${i.microns} µ` : null,
    i.gussetCm ? `fuelle ${num(i.gussetCm, 1)} cm` : null,
    i.zipper ? "zipper" : null,
    i.valve ? "válvula" : null,
    i.printed ? "impreso" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function QuoteBuilder({ initial, onSaved, onDirtyChange }: { initial?: BuilderInitial; onSaved?: (id: string) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const router = useRouter();
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [clients, setClients] = useState<Client[]>([]);

  // 1. Cliente
  const [client, setClient] = useState<BuilderClient>(initial ?? EMPTY_CLIENT);
  const [moreClient, setMoreClient] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const clientBox = useRef<HTMLDivElement>(null);

  // 2. Empaque
  const [structure, setStructure] = useState<Structure>("PAPE");
  const [bagType, setBagType] = useState<BagType>("COJIN");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [microns, setMicrons] = useState("");
  const [gusset, setGusset] = useState("");
  const [zipper, setZipper] = useState(false);
  const [valve, setValve] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [colors, setColors] = useState("1");
  const [reference, setReference] = useState("");
  const [customQty, setCustomQty] = useState("");

  // 3. Cotización
  const [items, setItems] = useState<BuilderItem[]>(initial?.items ?? []);
  const [deliveryKeys, setDeliveryKeys] = useState<string[]>(initial?.deliveryKeys ?? []);
  const [deliveryTouched, setDeliveryTouched] = useState(Boolean(initial?.id));
  const [printClause, setPrintClause] = useState(initial?.printClause ?? false);
  const [clauseTouched, setClauseTouched] = useState(Boolean(initial?.id));
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? DEFAULT_PAYMENT_TERMS);
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showConditions, setShowConditions] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/panel/quotation-pricing").then((r) => r.json()).then((d) => d?.config && setPricing(d.config)).catch(() => {});
    fetch("/api/panel/clients").then((r) => r.json()).then((d) => setClients(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (clientBox.current && !clientBox.current.contains(e.target as Node)) setClientOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Entrega y cláusula se completan solas mientras el comercial no las toque.
  const autoDelivery = useMemo(() => suggestDeliveryKeys(items.filter((i) => i.kind === "bag")), [items]);
  const effectiveDelivery = deliveryTouched ? deliveryKeys : autoDelivery;
  const autoClause = items.some((i) => i.printed || i.kind === "photo");
  const effectiveClause = clauseTouched ? printClause : autoClause;

  const setC = (patch: Partial<BuilderClient>) => { setClient((c) => ({ ...c, ...patch })); setDirty(true); };
  const clientMatches = useMemo(() => {
    const q = client.clientName.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => `${c.company ?? ""} ${c.fullName} ${c.email}`.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, client.clientName]);

  const pickClient = (c: Client) => {
    setClient({
      clientId: c.id, clientName: c.company || c.fullName, clientNit: client.clientNit, clientAddress: c.addressLine1 ?? "",
      clientCity: c.city ?? "", clientContact: c.fullName, clientEmail: c.email, clientPhone: c.phone ?? "",
    });
    setClientOpen(false);
    setDirty(true);
  };

  // Simulación en vivo (medidas en cm, como salen en la cotización).
  const effType: BagType = structure === "PAPE" ? "COJIN" : bagType;
  const needsGusset = effType !== "COJIN";
  const ready = parse(width) > 0 && parse(length) > 0 && parse(microns) > 0 && (!needsGusset || parse(gusset) > 0);
  const spec = ready
    ? { structure, bagType: effType, widthCm: parse(width), lengthCm: parse(length), microns: Math.round(parse(microns)), gussetCm: needsGusset ? parse(gusset) : 0, zipper, valve }
    : null;
  const sim = spec ? simulate(spec, pricing) : null;
  const custom = sim && parse(customQty) > 0 ? priceForQuantity(sim.rows, Math.round(parse(customQty))) : null;
  const photo = spec && printed
    ? calcPhotopolymer({ widthCm: spec.widthCm, lengthCm: spec.lengthCm, tracks: 1, repeats: 2, pricePerCm2: pricing.photopolymerCm2 })
    : null;

  const addBag = (row: ScaleRow, quantity: number) => {
    if (!spec) return;
    const bag: BuilderItem = {
      key: newKey(), kind: "bag",
      name: printed ? "EMPAQUE AL VACÍO IMPRESO" : "EMPAQUE AL VACÍO",
      reference: reference.trim(), quantity, unitPrice: row.unitPrice, unit: "UND",
      structure: spec.structure, bagType: spec.bagType, widthCm: spec.widthCm, lengthCm: spec.lengthCm, microns: spec.microns,
      gussetCm: spec.gussetCm || null, zipper: spec.zipper, valve: spec.valve, printed,
      kilos: Math.round(row.kilos * 100) / 100, pricePerKg: null, wastePct: null, zipperPerCm: null,
    };
    const next = [...items, bag];
    // Fotopolímeros: una sola línea por referencia impresa.
    if (photo && !items.some((i) => i.kind === "photo" && i.reference === bag.reference && i.widthCm === bag.widthCm && i.lengthCm === bag.lengthCm)) {
      next.push({
        key: newKey(), kind: "photo", name: "FOTOPOLÍMEROS", reference: bag.reference,
        quantity: Math.max(1, Math.round(parse(colors)) || 1), unitPrice: photo.approx, unit: "UND",
        structure: null, bagType: null, widthCm: bag.widthCm, lengthCm: bag.lengthCm, microns: null, gussetCm: null,
        zipper: false, valve: false, printed: false, kilos: null, pricePerKg: null, wastePct: null, zipperPerCm: null,
      });
    }
    setItems(next);
    setDirty(true);
    setFlash(`Agregado: ${num(quantity)} und a ${fmt(row.unitPrice)}`);
    setTimeout(() => setFlash(null), 2200);
  };

  const addOther = () => {
    setItems((s) => [...s, {
      key: newKey(), kind: "other", name: "", reference: "", quantity: 1, unitPrice: 0, unit: "UND",
      structure: null, bagType: null, widthCm: null, lengthCm: null, microns: null, gussetCm: null,
      zipper: false, valve: false, printed: false, kilos: null, pricePerKg: null, wastePct: null, zipperPerCm: null,
    }]);
    setDirty(true);
  };

  const updateItem = (key: string, patch: Partial<BuilderItem>) => { setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i))); setDirty(true); };
  const removeItem = (key: string) => { setItems((s) => s.filter((i) => i.key !== key)); setDirty(true); };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const iva = subtotal * 0.19;
  const canSave = client.clientName.trim().length > 0 && items.length > 0 && items.every((i) => i.name.trim());

  const save = async (then?: "preview") => {
    if (!canSave) {
      setError(!client.clientName.trim() ? "Falta el nombre del cliente" : items.length === 0 ? "Agrega al menos un empaque" : "Hay un ítem sin descripción");
      return;
    }
    setSaving(true);
    setError(null);
    // La pestaña de vista previa se abre ya (los navegadores bloquean ventanas abiertas tras un await).
    const win = then === "preview" ? window.open("about:blank", "_blank") : null;
    try {
      const r = await fetch("/api/panel/quotations/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial?.id,
          ...client,
          paymentTerms, validUntil: validUntil || null, notes,
          deliveryKeys: effectiveDelivery, printClause: effectiveClause,
          items: items.map((i) => ({ ...i, reference: i.reference || null })),
        }),
      });
      const d = await r.json();
      if (!r.ok) { win?.close(); setError(d.error ?? "No se pudo guardar"); return; }
      setDirty(false);
      if (win) win.location.href = `/imprimir-cotizacion/${d.id}`;
      if (!initial?.id) router.replace(`/panel/cotizaciones/${d.id}`);
      else { setFlash("Cambios guardados"); setTimeout(() => setFlash(null), 2200); onSaved?.(d.id); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-6">
        {/* 1. Cliente */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <StepTitle n={1} title="¿Para quién es?" hint="Escribe el nombre; si ya es cliente registrado, elígelo de la lista." />
          <div ref={clientBox} className="relative">
            <input
              className={`${input} text-base`}
              placeholder="Razón social o nombre del cliente"
              value={client.clientName}
              onFocus={() => setClientOpen(true)}
              onChange={(e) => { setC({ clientName: e.target.value, clientId: null }); setClientOpen(true); }}
            />
            {client.clientId && <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-bold text-[#16A34A]">Registrado</span>}
            {clientOpen && clientMatches.length > 0 && !client.clientId && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg">
                {clientMatches.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickClient(c)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-[#F1F5F9]">
                    <span className="font-bold text-[#1A1A1A]">{c.company || c.fullName}</span>
                    <span className="ml-2 text-xs text-[#94A3B8]">{[c.fullName !== (c.company || c.fullName) ? c.fullName : null, c.city].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className={label}>NIT o C.C.</label><input className={input} value={client.clientNit} onChange={(e) => setC({ clientNit: e.target.value })} /></div>
            <div><label className={label}>Contacto</label><input className={input} value={client.clientContact} onChange={(e) => setC({ clientContact: e.target.value })} /></div>
          </div>
          {moreClient ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Teléfono</label><input className={input} value={client.clientPhone} onChange={(e) => setC({ clientPhone: e.target.value })} /></div>
              <div><label className={label}>Correo</label><input className={input} value={client.clientEmail} onChange={(e) => setC({ clientEmail: e.target.value })} /></div>
              <div><label className={label}>Dirección</label><input className={input} value={client.clientAddress} onChange={(e) => setC({ clientAddress: e.target.value })} /></div>
              <div><label className={label}>Ciudad</label><input className={input} value={client.clientCity} onChange={(e) => setC({ clientCity: e.target.value })} /></div>
            </div>
          ) : (
            <button type="button" onClick={() => setMoreClient(true)} className="mt-3 text-sm font-bold text-[#051C46] hover:underline">
              + Teléfono, correo, dirección y ciudad
            </button>
          )}
        </section>

        {/* 2. Empaque */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <StepTitle n={2} title="¿Qué empaque?" hint="Escribe la bolsa y elige la cantidad. Puedes agregar varias." />
          <div className="flex flex-wrap items-center gap-2">
            <Pill active={structure === "PAPE"} onClick={() => setStructure("PAPE")}>PAPE</Pill>
            <Pill active={structure === "LAMINADO"} onClick={() => setStructure("LAMINADO")}>Laminado</Pill>
            {structure === "LAMINADO" && (
              <>
                <span className="mx-1 h-6 w-px bg-[#E2E8F0]" />
                {(["COJIN", "DOYPACK", "FLOWPACK"] as BagType[]).map((t) => (
                  <Pill key={t} active={bagType === t} onClick={() => setBagType(t)}>{BAG_TYPE_LABEL[t]}</Pill>
                ))}
              </>
            )}
          </div>

          <div className={`mt-4 grid gap-3 ${needsGusset ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <div><label className={label}>Ancho (cm)</label><input inputMode="decimal" className={`${input} text-lg font-bold`} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="ej. 18" /></div>
            <div><label className={label}>Largo (cm)</label><input inputMode="decimal" className={`${input} text-lg font-bold`} value={length} onChange={(e) => setLength(e.target.value)} placeholder="ej. 25" /></div>
            <div><label className={label}>Micras</label><input inputMode="numeric" className={`${input} text-lg font-bold`} value={microns} onChange={(e) => setMicrons(e.target.value)} placeholder="ej. 65" /></div>
            {needsGusset && (
              <div><label className={label}>{effType === "FLOWPACK" ? "Fuelle lateral (cm)" : "Fuelle abierto (cm)"}</label><input inputMode="decimal" className={`${input} text-lg font-bold`} value={gusset} onChange={(e) => setGusset(e.target.value)} /></div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill active={zipper} disabled={valve} onClick={() => setZipper((v) => !v)}>{zipper ? "✓ " : "+ "}Zipper</Pill>
            <Pill active={valve} disabled={zipper} onClick={() => setValve((v) => !v)}>{valve ? "✓ " : "+ "}Válvula</Pill>
            <Pill active={printed} onClick={() => setPrinted((v) => !v)}>{printed ? "✓ " : "+ "}Impreso</Pill>
            <input className="ml-auto min-w-48 flex-1 rounded-full border border-[#E2E8F0] px-4 py-2 text-sm outline-none focus:border-[#051C46]" placeholder="Referencia (opcional)" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          {printed && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F8FAFC] px-4 py-2.5 text-sm text-[#334155]">
              Se agregan los fotopolímeros:
              <input inputMode="numeric" value={colors} onChange={(e) => setColors(e.target.value)} className="w-14 rounded-lg border border-[#E2E8F0] px-2 py-1 text-center" />
              color(es) × <b>{photo ? fmt(photo.approx) : "—"}</b>
              <span className="text-xs text-[#94A3B8]">(revisa si hay rodillo; el valor se puede cambiar en la lista)</span>
            </div>
          )}

          <div className="mt-5">
            {!sim ? (
              <div className="rounded-xl border-2 border-dashed border-[#E2E8F0] p-8 text-center text-sm text-[#94A3B8]">
                Escribe ancho, largo y micras{needsGusset ? " y fuelle" : ""} y aquí aparecen los precios.
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-[#94A3B8]">
                  {sim.sizeClass ? `Bolsa ${sim.sizeClass.toLowerCase()} · ` : ""}{num(sim.unitWeightG, 2)} g por bolsa · {num(sim.unitsPerKg, 1)} bolsas por kilo · precios sin IVA
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sim.rows.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => addBag(r, r.quantity)}
                      className="group rounded-2xl border-2 border-[#E2E8F0] bg-white p-4 text-left transition hover:border-[#D60517] hover:shadow-md"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        {r.label === "Después de" ? `Desde ${num(r.kilos)} kg` : structure === "PAPE" ? `${r.label} rollo${r.label === "1" ? "" : "s"} · ${num(r.kilos)} kg` : r.label}
                      </p>
                      <p className="mt-1 text-xl font-black text-[#051C46]">{num(r.quantity)} <span className="text-sm font-bold text-[#64748B]">und</span></p>
                      <p className="text-sm text-[#334155]"><b className="text-[#D60517]">{fmt(r.unitPrice)}</b> c/u · {fmt(r.total)}</p>
                      <p className="mt-2 text-xs font-bold text-[#D60517] opacity-0 transition group-hover:opacity-100">+ Agregar a la cotización</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F8FAFC] px-4 py-3 text-sm">
                  <span className="text-[#64748B]">¿Otra cantidad?</span>
                  <input inputMode="numeric" value={customQty} onChange={(e) => setCustomQty(e.target.value)} placeholder="Ej. 15000" className="w-28 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-right outline-none focus:border-[#051C46]" />
                  {custom && (
                    <>
                      <span className="text-[#334155]">→ <b>{fmt(custom.unitPrice)}</b> c/u · {fmt(custom.unitPrice * Math.round(parse(customQty)))}</span>
                      <button type="button" onClick={() => addBag(custom, Math.round(parse(customQty)))} className="ml-auto rounded-lg bg-[#D60517] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#B00413]">
                        Agregar
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {flash && <p className="mt-3 rounded-lg bg-[#DCFCE7] px-3 py-2 text-sm font-semibold text-[#16A34A]">✓ {flash}</p>}
          </div>
        </section>
      </div>

      {/* 3. La cotización */}
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <section className="rounded-2xl border-2 border-[#051C46] bg-white">
          <div className="flex items-center justify-between rounded-t-xl bg-[#051C46] px-5 py-3 text-white">
            <span className="text-sm font-black">{initial?.number ? `Cotización No. ${initial.number}` : "Nueva cotización"}</span>
            <span className="text-xs text-white/70">{client.clientName || "Sin cliente"}</span>
          </div>

          <div className="max-h-[46vh] divide-y divide-[#F1F5F9] overflow-y-auto px-5">
            {items.length === 0 && (
              <p className="py-10 text-center text-sm text-[#94A3B8]">Aún no hay nada. Haz clic en una cantidad para agregarla.</p>
            )}
            {items.map((i) => (
              <div key={i.key} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {i.kind === "other" ? (
                      <input value={i.name} onChange={(e) => updateItem(i.key, { name: e.target.value })} placeholder="Descripción" autoFocus className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm font-bold outline-none focus:border-[#051C46]" />
                    ) : (
                      <p className="text-sm font-bold text-[#1A1A1A]">{i.kind === "photo" ? "Fotopolímeros" : i.printed ? "Empaque al vacío impreso" : "Empaque al vacío"}</p>
                    )}
                    <p className="text-xs text-[#64748B]">
                      {i.kind === "photo" ? `Para ${num(i.widthCm ?? 0, 1)} × ${num(i.lengthCm ?? 0, 1)} cm` : describeItem(i)}
                      {i.reference ? ` · ${i.reference}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeItem(i.key)} className="text-lg leading-none text-[#CBD5E1] hover:text-[#DC2626]" title="Quitar">×</button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <MiniNum value={i.quantity} onChange={(n) => updateItem(i.key, { quantity: n })} className="w-24" />
                  <span className="text-xs text-[#94A3B8]">{i.kind === "photo" ? "und ×" : "und ×"}</span>
                  <MiniNum value={i.unitPrice} onChange={(n) => updateItem(i.key, { unitPrice: n })} className="w-24" />
                  <span className="ml-auto font-bold text-[#1A1A1A]">{fmt(i.quantity * i.unitPrice)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5">
            <button type="button" onClick={addOther} className="mb-2 text-xs font-bold text-[#64748B] hover:text-[#051C46]">+ Otro ítem (diseño, flete…)</button>
          </div>

          <div className="space-y-1 border-t border-[#E2E8F0] px-5 py-3 text-sm">
            <div className="flex justify-between text-[#64748B]"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between text-[#64748B]"><span>IVA 19%</span><span>{fmt(iva)}</span></div>
            <div className="flex items-baseline justify-between pt-1"><span className="font-black text-[#051C46]">Total</span><span className="text-2xl font-black text-[#051C46]">{fmt(subtotal + iva)}</span></div>
          </div>

          <div className="border-t border-[#E2E8F0] px-5 py-3">
            <button type="button" onClick={() => setShowConditions((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-bold text-[#051C46]">Entrega y condiciones</span>
              <span className="text-xs text-[#64748B]">{showConditions ? "Ocultar" : "Ver / cambiar"}</span>
            </button>
            {!showConditions && (
              <p className="mt-1 text-xs text-[#64748B]">
                {effectiveDelivery.length
                  ? DELIVERY_OPTIONS.filter((o) => effectiveDelivery.includes(o.key)).map((o) => o.time.split(",")[0]).join(" / ")
                  : "Entrega por definir"}
                {" · "}{paymentTerms}{" · "}válida 30 días
              </p>
            )}
            {showConditions && (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className={label}>Tiempos de entrega {deliveryTouched ? "" : "(sugeridos)"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DELIVERY_OPTIONS.map((o) => {
                      const on = effectiveDelivery.includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          title={o.time}
                          onClick={() => {
                            setDeliveryTouched(true);
                            setDeliveryKeys(on ? effectiveDelivery.filter((k) => k !== o.key) : [...effectiveDelivery, o.key]);
                            setDirty(true);
                          }}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-[#D60517] bg-[#FDEEEF] text-[#D60517]" : "border-[#E2E8F0] text-[#64748B]"}`}
                        >
                          {o.group.replace("Referencia ", "")}: {o.label.toLowerCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Forma de pago</label><input className={input} value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); setDirty(true); }} /></div>
                  <div><label className={label}>Válida hasta</label><input type="date" className={input} value={validUntil} onChange={(e) => { setValidUntil(e.target.value); setDirty(true); }} placeholder="30 días" /></div>
                </div>
                <p className="text-xs text-[#64748B]">{QUANTITY_TOLERANCE}</p>
                <label className="flex items-start gap-2 text-xs text-[#334155]">
                  <input type="checkbox" className="mt-0.5 accent-[#D60517]" checked={effectiveClause} onChange={(e) => { setClauseTouched(true); setPrintClause(e.target.checked); setDirty(true); }} />
                  {PRINT_CLAUSE}
                </label>
                <div><label className={label}>Observaciones</label><textarea rows={2} className={input} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} /></div>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-b-xl border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
            {error && <p className="text-xs font-semibold text-[#DC2626]">{error}</p>}
            <button
              type="button"
              onClick={() => save("preview")}
              disabled={saving}
              className="w-full rounded-xl bg-[#D60517] py-3 text-sm font-black text-white shadow-[0_2px_8px_rgba(214,5,23,0.3)] transition hover:bg-[#B00413] disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar y ver cotización"}
            </button>
            <button type="button" onClick={() => save()} disabled={saving || (Boolean(initial?.id) && !dirty)} className="w-full rounded-xl py-2 text-sm font-bold text-[#051C46] hover:bg-white disabled:cursor-default disabled:text-[#94A3B8] disabled:hover:bg-transparent">
              {initial?.id ? (dirty ? "Guardar cambios" : "Sin cambios por guardar") : "Solo guardar"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
