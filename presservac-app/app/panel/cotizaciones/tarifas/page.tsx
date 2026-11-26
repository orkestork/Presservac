"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/bag-pricing";

const inputClass =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-right text-sm text-[#1A1A1A] outline-none focus:border-[#D60517]";

type PapeKey = keyof PricingConfig["pape"];

const PAPE_FIELDS: { key: PapeKey; label: string; hint?: string }[] = [
  { key: "firstRollNormal", label: "Primer rollo · bolsa normal", hint: "Valor del rollo completo" },
  { key: "firstRollSmall", label: "Primer rollo · bolsa pequeña" },
  { key: "extraKgNormal", label: "Kilo adicional · normal" },
  { key: "extraKgSmall", label: "Kilo adicional · pequeña" },
  { key: "largeFirstKg", label: "Bolsa grande · kilo escala 1" },
  { key: "largeNextKg", label: "Bolsa grande · kilo escala 2" },
  { key: "afterKg", label: "Valor kilo «después de»" },
  { key: "maxScaleKg", label: "Tope de escalas (kg)" },
  { key: "rollWidthCm", label: "Rollo madre · medida (cm)" },
  { key: "rollWeightKg", label: "Rollo madre · peso (kg)" },
  { key: "wastePct", label: "Merma PAPE (%)" },
  { key: "smallWidthCm", label: "Pequeña si el ancho es menor a (cm)" },
  { key: "largeOpenLengthCm", label: "Grande si largo × 2 supera (cm)" },
];

export default function TarifasPage() {
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/panel/quotation-pricing").then((r) => r.json()).then((d) => setCfg(d.config ?? DEFAULT_PRICING)).catch(() => setCfg(DEFAULT_PRICING));
  }, []);

  if (!cfg) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></div>;
  }

  const val = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const setPape = (k: PapeKey, v: string) => setCfg({ ...cfg, pape: { ...cfg.pape, [k]: val(v) } });
  const setScale = (i: number, k: "kg" | "pricePerKg", v: string) =>
    setCfg({ ...cfg, laminado: { ...cfg.laminado, scales: cfg.laminado.scales.map((s, j) => (j === i ? { ...s, [k]: val(v) } : s)) } });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/panel/quotation-pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d.error ?? "No se pudo guardar" }); return; }
      setCfg(d.config);
      setMsg({ ok: true, text: "Tarifas guardadas. El simulador ya usa los valores nuevos." });
    } finally {
      setSaving(false);
    }
  };

  const numInput = (value: number, onChange: (v: string) => void) => (
    <input inputMode="decimal" defaultValue={String(value)} key={String(value)} onBlur={(e) => onChange(e.target.value)} className={inputClass} />
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Cotizaciones</p>
          <h1 className="mt-1 text-2xl font-black text-[#051C46]">Tarifas del simulador</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">Valores sin IVA. Solo el administrador puede guardar cambios.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCfg(DEFAULT_PRICING)} className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]">
            Restaurar valores del Excel
          </button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-[#D60517] px-4 py-2 text-sm font-bold text-white hover:bg-[#B00413] disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar tarifas"}
          </button>
        </div>
      </div>
      {msg && <div className={`mb-4 rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>{msg.text}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[#64748B]">PAPE</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAPE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">{f.label}</label>
                {numInput(cfg.pape[f.key], (v) => setPape(f.key, v))}
                {f.hint && <p className="mt-0.5 text-[11px] text-[#94A3B8]">{f.hint}</p>}
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
            <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[#64748B]">Laminado</h2>
            <div className="mb-3 w-48">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Merma laminado (%)</label>
              {numInput(cfg.laminado.wastePct, (v) => setCfg({ ...cfg, laminado: { ...cfg.laminado, wastePct: val(v) } }))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  <th className="pb-1">Escala (kg)</th><th className="pb-1">Valor kilo</th><th />
                </tr>
              </thead>
              <tbody>
                {cfg.laminado.scales.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">{numInput(s.kg, (v) => setScale(i, "kg", v))}</td>
                    <td className="py-1 pr-2">{numInput(s.pricePerKg, (v) => setScale(i, "pricePerKg", v))}</td>
                    <td className="w-16 py-1 text-right">
                      <button
                        onClick={() => setCfg({ ...cfg, laminado: { ...cfg.laminado, scales: cfg.laminado.scales.filter((_, j) => j !== i) } })}
                        className="text-xs font-bold text-[#DC2626] hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() => setCfg({ ...cfg, laminado: { ...cfg.laminado, scales: [...cfg.laminado.scales, { kg: 0, pricePerKg: 0 }] } })}
              className="mt-2 text-xs font-bold text-[#051C46] hover:underline"
            >
              + Agregar escala
            </button>
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
            <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[#64748B]">Adicionales</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Zipper ($ por cm de ancho)</label>
                {numInput(cfg.zipperPerCm, (v) => setCfg({ ...cfg, zipperPerCm: val(v) }))}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Postura válvula ($ und)</label>
                {numInput(cfg.valve, (v) => setCfg({ ...cfg, valve: val(v) }))}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Fotopolímero ($ cm²)</label>
                {numInput(cfg.photopolymerCm2, (v) => setCfg({ ...cfg, photopolymerCm2: val(v) }))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
