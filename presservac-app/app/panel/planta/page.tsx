"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MdSearch } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { duration, PLANT_STATUS } from "@/lib/plant-status";
import { PhaseStrip } from "./_components/phase-strip";
import { STAGE_LABEL } from "../../components/fulfillment-ui";

type Order = {
  id: string; number: number; reference: string; description: string; bagType: string | null; printed: boolean;
  quantity: number; dueDate: string | null; status: string; stage: string; routeName: string; createdAt: string;
  quotation: { id: string; number: string; clientName: string; sellerName: string };
  progress: { done: number; total: number };
  current: { name: string; status: string; since: string } | null;
  phases: { name: string; status: string }[];
};

const FILTERS = [
  { key: "active", label: "En curso" },
  { key: "PENDING", label: "Por empezar" },
  { key: "IN_PROGRESS", label: "En producción" },
  { key: "DONE", label: "Terminadas" },
];

export default function PlantaPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [phaseNames, setPhaseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const d = await fetch("/api/panel/planta").then((r) => r.json()).catch(() => ({}));
    setOrders(d.orders ?? []);
    setPhaseNames(d.phases ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["plant"], load);

  const active = orders.filter((o) => o.status === "PENDING" || o.status === "IN_PROGRESS");
  const byPhase = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of active) if (o.current) m[o.current.name] = (m[o.current.name] ?? 0) + 1;
    return m;
  }, [active]);

  const shown = orders.filter((o) => {
    if (filter === "active" ? !(o.status === "PENDING" || o.status === "IN_PROGRESS") : o.status !== filter) return false;
    if (phaseFilter && o.current?.name !== phaseFilter) return false;
    const s = search.trim().toLowerCase();
    return !s || `${o.number} ${o.reference} ${o.quotation.clientName}`.toLowerCase().includes(s);
  });
  const late = active.filter((o) => o.dueDate && new Date(o.dueDate).getTime() < now).length;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Paso 4 del proceso</p>
          <h1 className="mt-1 text-2xl font-black text-[#051C46]">Producción</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">Cada orden llega cuando comercial aprueba el arte y avanza fase por fase.</p>
        </div>
        <div className="relative">
          <MdSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="OP, referencia o cliente" className="w-64 rounded-xl border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#051C46]" />
        </div>
      </div>

      {/* ¿Dónde está cada orden? */}
      {phaseNames.length > 0 && (
        <div className="mb-5 overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <div className="flex min-w-max items-stretch gap-2">
            {phaseNames.map((n, i) => {
              const c = byPhase[n] ?? 0;
              const on = phaseFilter === n;
              return (
                <button
                  key={n}
                  onClick={() => setPhaseFilter(on ? null : n)}
                  className={`w-32 rounded-xl border p-3 text-left transition ${on ? "border-[#D60517] bg-[#FDEEEF]" : c ? "border-[#051C46]/30 hover:border-[#051C46]" : "border-[#E2E8F0] opacity-70 hover:opacity-100"}`}
                >
                  <p className="text-[10px] font-bold text-[#94A3B8]">FASE {i + 1}</p>
                  <p className="text-xs font-bold leading-tight text-[#051C46]">{n}</p>
                  <p className={`mt-1 text-2xl font-black ${c ? "text-[#D60517]" : "text-[#CBD5E1]"}`}>{c}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${filter === f.key ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>
            {f.label}
          </button>
        ))}
        {late > 0 && <span className="rounded-full bg-[#FEE2E2] px-3 py-1.5 text-sm font-bold text-[#DC2626]">{late} atrasada{late > 1 ? "s" : ""}</span>}
        {phaseFilter && <button onClick={() => setPhaseFilter(null)} className="text-sm font-bold text-[#D60517] hover:underline">Quitar filtro «{phaseFilter}»</button>}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center">
          <p className="text-lg font-black text-[#051C46]">No hay órdenes de producción</p>
          <p className="mt-1 text-sm text-[#64748B]">Llegan solas cuando comercial aprueba un arte en <Link href="/panel/diseno" className="font-bold text-[#051C46] underline">Diseño</Link>.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-sm text-[#94A3B8]">Nada con este filtro.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => {
            const st = PLANT_STATUS[o.status];
            const isLate = o.dueDate && o.status !== "DONE" && new Date(o.dueDate).getTime() < now;
            return (
              <Link key={o.id} href={`/panel/planta/${o.id}`} className="block rounded-2xl border border-[#E2E8F0] bg-white p-4 transition hover:border-[#051C46] hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-[#D60517]">OP-{o.number}</span>
                      <span className="text-base font-black text-[#051C46]">{o.reference}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                      {isLate && <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">Atrasada</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-[#64748B]">{o.quotation.clientName} · {o.description || o.routeName} · Cot. {o.quotation.number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-[#051C46]">{o.quantity.toLocaleString("es-CO")} <span className="text-xs font-bold text-[#64748B]">und</span></p>
                    {o.dueDate && <p className="text-xs text-[#64748B]">Entrega {new Date(o.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })}</p>}
                  </div>
                </div>
                <div className="mt-3"><PhaseStrip phases={o.phases} /></div>
                <div className="mt-1.5 flex justify-between text-xs">
                  <span className="font-bold text-[#334155]">
                    {o.status === "DONE" ? (o.stage === "PRODUCTION" ? "✓ Terminada · falta liberar a despacho" : `✓ ${STAGE_LABEL[o.stage] ?? ""}`) : o.current ? `${o.current.status === "IN_PROGRESS" ? "En" : "Sigue:"} ${o.current.name}` : ""}
                    {o.current?.status === "IN_PROGRESS" && <span className="font-normal text-[#94A3B8]"> · hace {duration(o.current.since, now)}</span>}
                  </span>
                  <span className="text-[#94A3B8]">{o.progress.done} de {o.progress.total} fases</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
