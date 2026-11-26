"use client";
import { useEffect, useState } from "react";
import { MdArrowDownward, MdArrowUpward, MdClose } from "react-icons/md";

type Phase = { name: string; description?: string; unit?: string; onlyIfPrinted?: boolean };
type Route = { id: string; name: string; bagType: string | null; phases: Phase[] };

const UNITS = [
  { value: "", label: "Sin cantidad" },
  { value: "kg", label: "kg" },
  { value: "m", label: "metros" },
  { value: "und", label: "unidades" },
];

export default function FasesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sel, setSel] = useState(0);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/panel/planta/rutas").then((r) => r.json()).then((d) => {
      setRoutes(d.routes ?? []);
      setPhases(d.routes?.[0]?.phases ?? []);
    }).catch(() => {});
  }, []);

  const route = routes[sel];
  const edit = (i: number, patch: Partial<Phase>) => { setPhases((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => {
    setPhases((p) => { const c = [...p]; const t = c[i + d]; if (!t) return p; c[i + d] = c[i]; c[i] = t; return c; });
    setDirty(true);
  };

  const save = async () => {
    if (!route) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/panel/planta/rutas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: route.id, phases }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: d.error ?? "No se pudo guardar" }); return; }
      setRoutes(d.routes); setPhases(d.routes[sel]?.phases ?? []); setDirty(false);
      setMsg({ ok: true, text: "Fases guardadas. Aplican a las órdenes nuevas; las que ya están en planta no cambian." });
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Producción</p>
          <h1 className="mt-1 text-2xl font-black text-[#051C46]">Fases de producción</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">El orden en que pasa cada empaque por la planta.</p>
        </div>
        <button onClick={save} disabled={!dirty || saving} className="rounded-xl bg-[#D60517] px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">
          {saving ? "Guardando…" : "Guardar fases"}
        </button>
      </div>

      {routes.length > 1 && (
        <div className="mb-4 flex gap-2">
          {routes.map((r, i) => (
            <button key={r.id} onClick={() => { setSel(i); setPhases(r.phases); setDirty(false); }} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${sel === i ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0]"}`}>{r.name}</button>
          ))}
        </div>
      )}
      {route && <p className="mb-3 text-sm font-bold text-[#051C46]">Ruta: {route.name}</p>}
      {msg && <div className={`mb-4 rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>{msg.text}</div>}

      <ol className="space-y-2">
        {phases.map((p, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#051C46] text-xs font-black text-white">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <input value={p.name} onChange={(e) => edit(i, { name: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-bold outline-none focus:border-[#051C46]" placeholder="Nombre de la fase" />
              <input value={p.description ?? ""} onChange={(e) => edit(i, { description: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs outline-none focus:border-[#051C46]" placeholder="Qué se hace (lo ve el operario)" />
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#64748B]">
                <label className="flex items-center gap-2">
                  Se registra en
                  <select value={p.unit ?? ""} onChange={(e) => edit(i, { unit: e.target.value })} className="rounded-lg border border-[#E2E8F0] px-2 py-1">
                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(p.onlyIfPrinted)} onChange={(e) => edit(i, { onlyIfPrinted: e.target.checked })} className="accent-[#D60517]" />
                  Solo si el empaque es impreso
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[#94A3B8]">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-[#051C46] disabled:opacity-30" title="Subir"><MdArrowUpward /></button>
              <button onClick={() => move(i, 1)} disabled={i === phases.length - 1} className="hover:text-[#051C46] disabled:opacity-30" title="Bajar"><MdArrowDownward /></button>
              <button onClick={() => { setPhases((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="hover:text-[#DC2626]" title="Quitar"><MdClose /></button>
            </div>
          </li>
        ))}
      </ol>
      <button onClick={() => { setPhases((p) => [...p, { name: "", unit: "und" }]); setDirty(true); }} className="mt-3 w-full rounded-2xl border-2 border-dashed border-[#CBD5E1] py-3 text-sm font-bold text-[#64748B] hover:border-[#051C46] hover:text-[#051C46]">
        + Agregar fase
      </button>
    </div>
  );
}
