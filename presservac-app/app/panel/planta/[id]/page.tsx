"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MdCheck, MdDownload, MdPictureAsPdf, MdPlayArrow } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { duration, PLANT_STATUS } from "@/lib/plant-status";
import { PhaseStrip } from "../_components/phase-strip";
import { FulfillmentBox } from "../_components/fulfillment-box";

type Step = {
  id: string; position: number; name: string; description: string | null; unit: string; status: string;
  responsible: string | null; outputQty: number | null; wasteKg: number | null; notes: string | null;
  startedAt: string | null; finishedAt: string | null; updatedBy: string | null;
};
type Order = {
  id: string; number: number; reference: string; description: string; status: string; routeName: string;
  quantity: number; dueDate: string | null; printed: boolean; bagType: string | null; structure: string | null;
  widthCm: number | null; lengthCm: number | null; gussetCm: number | null; microns: number | null; zipper: boolean; valve: boolean;
  notes: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; createdBy: string;
  quotation: { id: string; number: string; clientName: string; sellerName: string };
  progress: { done: number; total: number };
  phases: { name: string; status: string }[];
  art: { requestId: string; id: string; version: number; mimeType: string } | null;
  steps: Step[];
  caps: { canOperate: boolean; canManage: boolean };
};

const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const n = (v: number | null, d = 1) => (v == null ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: d }));

export default function PlantOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [form, setForm] = useState({ responsible: "", outputQty: "", wasteKg: "", notes: "" });
  const [skipFor, setSkipFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/panel/planta/${id}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) { setError(j?.error ?? "No se pudo cargar"); return; }
    setO(j);
    setNow(Date.now());
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const { markLocalWrite } = useRealtimeRefresh(["plant"], load);

  const act = async (stepId: string, action: "start" | "finish" | "skip" | "reopen", extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    try {
      markLocalWrite();
      const r = await fetch(`/api/panel/planta/paso/${stepId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "No se pudo guardar"); return; }
      setForm({ responsible: "", outputQty: "", wasteKg: "", notes: "" });
      setSkipFor(null);
      await load();
    } finally { setBusy(false); }
  };

  if (!o) {
    return <div className="flex h-64 items-center justify-center">{error ? <p className="text-sm font-semibold text-[#DC2626]">{error}</p> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" />}</div>;
  }

  const st = PLANT_STATUS[o.status];
  const open = o.status === "PENDING" || o.status === "IN_PROGRESS";
  const active = o.steps.find((s) => s.status === "IN_PROGRESS") ?? o.steps.find((s) => s.status === "PENDING") ?? null;
  const lastClosed = [...o.steps].reverse().find((s) => s.status === "DONE");
  const canReopen = (s: Step) => o.caps.canOperate && s.id === lastClosed?.id && !o.steps.some((x) => x.position > s.position && (x.status === "DONE" || x.status === "IN_PROGRESS"));
  const spec = [
    o.structure === "LAMINADO" ? "Laminado" : o.structure ? "PAPE" : null,
    o.bagType ? o.bagType.charAt(0) + o.bagType.slice(1).toLowerCase() : null,
    o.widthCm && o.lengthCm ? `${n(o.widthCm)} × ${n(o.lengthCm)} cm` : null,
    o.gussetCm ? `fuelle ${n(o.gussetCm)} cm` : null,
    o.microns ? `${o.microns} µ` : null,
    o.zipper ? "zipper" : null, o.valve ? "válvula" : null, o.printed ? "impreso" : null,
  ].filter(Boolean).join(" · ");
  const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#051C46]";

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/panel/planta" className="text-xs font-bold text-[#94A3B8] hover:text-[#1A1A1A]">← Producción</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-black text-[#D60517]">OP-{o.number}</span>
            <h1 className="text-2xl font-black text-[#051C46]">{o.reference}</h1>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest" style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-[#64748B]">
            {o.quotation.clientName} · <Link href={`/panel/cotizaciones/${o.quotation.id}`} className="font-bold text-[#051C46] hover:underline">Cotización {o.quotation.number}</Link> · Ruta {o.routeName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-[#051C46]">{o.quantity.toLocaleString("es-CO")} <span className="text-sm font-bold text-[#64748B]">und</span></p>
          {o.dueDate && <p className="text-sm text-[#64748B]">Entrega {new Date(o.dueDate).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</p>}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <PhaseStrip phases={o.phases} />
        <p className="mt-2 text-xs text-[#64748B]">{o.progress.done} de {o.progress.total} fases terminadas{o.finishedAt ? ` · terminó ${when(o.finishedAt)}` : o.startedAt ? ` · empezó ${when(o.startedAt)}` : ""}</p>
      </div>

      {error && <div className="mb-4 flex justify-between rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#DC2626]"><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Fases */}
        <ol className="space-y-3">
          {o.steps.map((s) => {
            const isActive = open && active?.id === s.id;
            const done = s.status === "DONE";
            const skipped = s.status === "SKIPPED";
            return (
              <li key={s.id} className={`rounded-2xl border bg-white ${isActive ? "border-2 border-[#D60517] shadow-md" : "border-[#E2E8F0]"} ${skipped ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-4 p-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${done ? "bg-[#16A34A] text-white" : skipped ? "bg-[#E2E8F0] text-[#94A3B8]" : isActive ? "bg-[#D60517] text-white" : "bg-[#F1F5F9] text-[#94A3B8]"}`}>
                    {done ? <MdCheck size={18} /> : s.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-base font-black ${skipped ? "text-[#94A3B8] line-through" : "text-[#051C46]"}`}>{s.name}</p>
                      <span className="text-xs font-bold text-[#64748B]">
                        {done && s.startedAt && s.finishedAt ? `${duration(s.startedAt, new Date(s.finishedAt).getTime())}` : s.status === "IN_PROGRESS" && s.startedAt ? <span className="text-[#D60517]">En proceso · {duration(s.startedAt, now)}</span> : skipped ? "No aplica" : ""}
                      </span>
                    </div>
                    {s.description && !done && <p className="text-sm text-[#64748B]">{s.description}</p>}
                    {done && (
                      <p className="mt-1 text-sm text-[#334155]">
                        {s.responsible && <><b>{s.responsible}</b> · </>}
                        {s.outputQty != null && <>salió {n(s.outputQty)} {s.unit} · </>}
                        {s.wasteKg != null && <>merma {n(s.wasteKg)} kg · </>}
                        {s.finishedAt && when(s.finishedAt)}
                      </p>
                    )}
                    {s.notes && (done || skipped) && <p className="mt-1 rounded-lg bg-[#F8FAFC] px-2 py-1 text-xs text-[#475569]">{s.notes}</p>}
                    {s.status === "IN_PROGRESS" && s.responsible && <p className="mt-1 text-xs text-[#64748B]">Responsable: <b>{s.responsible}</b> · desde {s.startedAt && when(s.startedAt)}</p>}

                    {/* Acciones de la fase activa */}
                    {isActive && o.caps.canOperate && s.status === "PENDING" && (
                      skipFor === s.id ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input className={`${input} flex-1`} placeholder="¿Por qué no aplica?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                          <button disabled={busy} onClick={() => act(s.id, "skip", { notes: form.notes })} className="rounded-xl bg-[#64748B] px-4 py-2 text-sm font-bold text-white">Confirmar</button>
                          <button onClick={() => setSkipFor(null)} className="px-2 text-sm font-bold text-[#64748B]">Cancelar</button>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input className={`${input} max-w-56`} placeholder="Responsable (opcional)" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
                          <button disabled={busy} onClick={() => act(s.id, "start", { responsible: form.responsible })} className="inline-flex items-center gap-1 rounded-xl bg-[#D60517] px-5 py-2.5 text-sm font-black text-white hover:bg-[#B00413]">
                            <MdPlayArrow size={18} /> Iniciar fase
                          </button>
                          <button onClick={() => { setSkipFor(s.id); setForm({ ...form, notes: "" }); }} className="text-xs font-bold text-[#94A3B8] hover:text-[#334155]">No aplica</button>
                        </div>
                      )
                    )}
                    {isActive && o.caps.canOperate && s.status === "IN_PROGRESS" && (
                      <div className="mt-3 rounded-xl bg-[#F8FAFC] p-3">
                        <div className="grid gap-2 sm:grid-cols-3">
                          {s.unit && (
                            <label className="text-xs font-semibold text-[#64748B]">
                              Cantidad que sale ({s.unit})
                              <input inputMode="decimal" className={`${input} mt-1`} value={form.outputQty} onChange={(e) => setForm({ ...form, outputQty: e.target.value })} placeholder={s.unit === "und" ? o.quantity.toLocaleString("es-CO") : ""} />
                            </label>
                          )}
                          <label className="text-xs font-semibold text-[#64748B]">
                            Merma (kg)
                            <input inputMode="decimal" className={`${input} mt-1`} value={form.wasteKg} onChange={(e) => setForm({ ...form, wasteKg: e.target.value })} />
                          </label>
                          <label className={`text-xs font-semibold text-[#64748B] ${s.unit ? "" : "sm:col-span-2"}`}>
                            Observaciones
                            <input className={`${input} mt-1`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                          </label>
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => act(s.id, "finish", {
                            outputQty: form.outputQty ? Number(form.outputQty.replace(/\./g, "").replace(",", ".")) : null,
                            wasteKg: form.wasteKg ? Number(form.wasteKg.replace(",", ".")) : null,
                            notes: form.notes,
                          })}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-[#16A34A] py-2.5 text-sm font-black text-white hover:bg-[#15803D]"
                        >
                          <MdCheck size={18} /> Terminar «{s.name}» {o.steps.some((x) => x.position > s.position && x.status === "PENDING") ? "y pasar a la siguiente" : "y cerrar la orden"}
                        </button>
                      </div>
                    )}
                    {canReopen(s) && (
                      <button disabled={busy} onClick={() => act(s.id, "reopen")} className="mt-2 text-xs font-bold text-[#94A3B8] hover:text-[#334155]">Corregir (reabrir esta fase)</button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <aside className="space-y-4">
          {o.status === "DONE" && <FulfillmentBox orderId={o.id} />}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 text-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Ficha del empaque</p>
            <p className="font-bold text-[#1A1A1A]">{spec || o.description || "—"}</p>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-[#94A3B8]">Cliente</dt><dd className="text-[#334155]">{o.quotation.clientName}</dd>
              <dt className="text-[#94A3B8]">Comercial</dt><dd className="text-[#334155]">{o.quotation.sellerName}</dd>
              <dt className="text-[#94A3B8]">Orden creada</dt><dd className="text-[#334155]">{when(o.createdAt)}</dd>
              <dt className="text-[#94A3B8]">Aprobó</dt><dd className="text-[#334155]">{o.createdBy}</dd>
            </dl>
            {o.notes && <p className="mt-2 rounded-lg bg-[#F8FAFC] p-2 text-xs">{o.notes}</p>}
          </section>
          {o.art && (
            <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
              <div className="flex h-44 items-center justify-center bg-[#F1F5F9]">
                {o.art.mimeType.startsWith("image/")
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/panel/diseno/archivo/${o.art.id}`} alt="Arte aprobado" className="h-full w-full object-contain" />
                  : <MdPictureAsPdf size={40} className="text-[#D60517]" />}
              </div>
              <div className="flex items-center justify-between p-3 text-xs">
                <Link href={`/panel/diseno/${o.art.requestId}`} className="font-bold text-[#051C46] hover:underline">Arte aprobado · v{o.art.version}</Link>
                <a href={`/api/panel/diseno/archivo/${o.art.id}?descargar`} className="inline-flex items-center gap-1 font-bold text-[#051C46] hover:underline"><MdDownload /> Descargar</a>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
