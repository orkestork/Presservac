"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MdPalette } from "react-icons/md";
import { DESIGN_STATUS } from "@/lib/design-status";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

type Req = { id: string; reference: string; status: string; latest: { version: number } | null; myTurn: boolean };
type Pay = {
  status: "NONE" | "REQUESTED" | "CONFIRMED"; financeNote: string | null; proof: { name: string | null } | null;
  total: number; paid: number; confirmedAt: string | null;
  payments: { id: string; kindLabel: string; amount: number; paidAt: string }[];
};
const money = (n: number) => (n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
type Op = { id: string; number: number; reference: string; status: string; stage: string; current: { name: string; status: string } | null; progress: { done: number; total: number } };
type QItem = { name: string; reference: string | null; structure: string | null; bagType: string | null; widthCm: number | null; lengthCm: number | null; microns: number | null };

const num = (n: number | null) => (n == null ? "" : n.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
const describe = (i: QItem) =>
  [i.structure === "LAMINADO" ? "Laminado" : i.structure ? "PAPE" : null, i.widthCm && i.lengthCm ? `${num(i.widthCm)} × ${num(i.lengthCm)} cm` : null, i.microns ? `${i.microns} µ` : null]
    .filter(Boolean).join(" · ");

/** Artes de la cotización + botón para pasarla a diseño (paso 2 del proceso). */
export function DesignPanel({ quotationId, quotationNumber, closed }: { quotationId: string; quotationNumber: string; closed?: boolean }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState<Op[]>([]);
  const [pay, setPay] = useState<Pay | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/panel/diseno?cotizacion=${quotationId}`);
    if (r.status === 401 || r.status === 403) { setAllowed(false); return; }
    const d = await r.json().catch(() => ({}));
    setReqs(d.requests ?? []);
    const p = await fetch(`/api/panel/planta?cotizacion=${quotationId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setOps(p?.orders ?? []);
    const f = await fetch(`/api/panel/finanzas/${quotationId}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setPay(f);
  }, [quotationId]);

  const uploadProof = async (file: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/panel/finanzas/${quotationId}/soporte`, { method: "POST", body: fd }).catch(() => {});
    setUploading(false);
    load();
  };
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["design", "plant", "payments"], load);

  if (!allowed || reqs === null) return null;
  const active = reqs.filter((r) => r.status !== "CANCELLED");

  return (
    <section className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FCE7F3] text-[#BE185D]"><MdPalette size={20} /></span>
          <div>
            <p className="text-sm font-black text-[#051C46]">Pago y diseño del arte</p>
            <p className="text-xs text-[#64748B]">
              {active.length === 0 ? "Si lleva impresión, pásala a diseño para que hagan el arte." : `${active.filter((r) => r.status === "APPROVED").length} de ${active.length} aprobado(s)`}
            </p>
          </div>
        </div>
        {!closed && (
          <button onClick={() => setOpen(true)} className="rounded-xl bg-[#051C46] px-4 py-2 text-sm font-bold text-white hover:opacity-90">
            {active.length ? "+ Otra referencia a diseño" : "Pasar a diseño →"}
          </button>
        )}
      </div>
      {pay && (
        <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${pay.status === "CONFIRMED" ? "bg-[#F0FDF4] text-[#15803D]" : pay.status === "REQUESTED" ? "bg-[#FFF7ED] text-[#9A3412]" : "bg-[#F8FAFC] text-[#64748B]"}`}>
          <span className="font-bold">
            {pay.status === "CONFIRMED"
              ? `✓ Pago confirmado por financiera${pay.payments[0] ? ` · ${pay.payments[0].kindLabel}${pay.payments[0].amount ? ` ${money(pay.payments[0].amount)}` : ""}` : ""}`
              : pay.status === "REQUESTED" ? "Esperando que financiera confirme el pago; diseño empieza después" : "Pago: al pasar a diseño se le pide a financiera que lo confirme"}
          </span>
          {pay.status !== "CONFIRMED" && pay.financeNote && <span className="w-full text-xs">Financiera dice: “{pay.financeNote}”</span>}
          {pay.status !== "CONFIRMED" && (
            <span className="ml-auto flex items-center gap-2 text-xs">
              {pay.proof && <a href={`/api/panel/finanzas/${quotationId}/soporte`} target="_blank" rel="noopener noreferrer" className="font-bold underline">Ver comprobante</a>}
              {!closed && (
                <label className="cursor-pointer rounded-lg border border-current px-2 py-1 font-bold">
                  {uploading ? "Subiendo…" : pay.proof ? "Cambiar comprobante" : "Adjuntar comprobante del cliente"}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
                </label>
              )}
            </span>
          )}
        </div>
      )}
      {active.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {active.map((r) => {
            const m = DESIGN_STATUS[r.status];
            return (
              <Link key={r.id} href={`/panel/diseno/${r.id}`} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:shadow-sm ${r.myTurn ? "border-[#D60517]" : "border-[#E2E8F0]"}`}>
                <span className="font-bold text-[#1A1A1A]">{r.reference}</span>
                {r.latest && <span className="text-xs text-[#94A3B8]">v{r.latest.version}</span>}
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: m.color, background: m.bg }}>{m.label}</span>
                {r.myTurn && <span className="text-[10px] font-black uppercase text-[#D60517]">Te toca</span>}
              </Link>
            );
          })}
        </div>
      )}
      {ops.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[#F1F5F9] pt-3">
          <span className="self-center text-xs font-bold text-[#94A3B8]">Producción:</span>
          {ops.map((o) => (
            <Link key={o.id} href={`/panel/planta/${o.id}`} className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm hover:shadow-sm">
              <span className="font-black text-[#D60517]">OP-{o.number}</span>
              <span className="font-bold text-[#1A1A1A]">{o.reference}</span>
              <span className="text-xs text-[#64748B]">
                {o.status === "DONE" ? (o.stage === "CLOSED" ? "✓ Finalizado" : o.stage === "DELIVERED" ? "✓ Entregado" : o.stage === "IN_TRANSIT" ? "En entrega" : o.stage === "LOGISTICS" ? "En logística" : o.stage === "BALANCE_CHECK" ? "Financiera: saldo" : "✓ Producida") : o.status === "CANCELLED" ? "Cancelada" : o.current ? `${o.current.status === "IN_PROGRESS" ? "En" : "Sigue:"} ${o.current.name}` : ""} · {o.progress.done}/{o.progress.total}
              </span>
            </Link>
          ))}
        </div>
      )}
      {open && <SendToDesignModal quotationId={quotationId} quotationNumber={quotationNumber} paid={pay?.status === "CONFIRMED"} hasProof={Boolean(pay?.proof)} existing={active.map((r) => r.reference)} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </section>
  );
}

function SendToDesignModal({
  quotationId, quotationNumber, existing, onClose, onDone, paid, hasProof,
}: { quotationId: string; quotationNumber: string; existing: string[]; onClose: () => void; onDone: () => void; paid?: boolean; hasProof?: boolean }) {
  const [proof, setProof] = useState<File | null>(null);
  const [items, setItems] = useState<QItem[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [extra, setExtra] = useState("");
  const [brief, setBrief] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/panel/quotations/${quotationId}`).then((r) => r.json()).then((q) => {
      // Una opción por empaque distinto (referencia + medidas); los impresos vienen marcados.
      const seen = new Set<string>();
      const bags = (q.items ?? []).filter((i: QItem) => i.structure).filter((i: QItem) => {
        const k = `${i.reference ?? ""}|${i.widthCm}|${i.lengthCm}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      setItems(bags);
      setChecked(Object.fromEntries(bags.map((b: QItem, i: number) => [i, /IMPRES/i.test(b.name)])));
      setNames(Object.fromEntries(bags.map((b: QItem, i: number) => [i, b.reference || `Bolsa ${num(b.widthCm)} × ${num(b.lengthCm)} cm`])));
    }).catch(() => {});
  }, [quotationId]);

  const refs = useMemo(() => {
    const list = items.map((it, i) => ({ it, i })).filter(({ i }) => checked[i]).map(({ it, i }) => ({
      reference: (names[i] || "").trim(), description: describe(it), widthCm: it.widthCm, lengthCm: it.lengthCm,
    }));
    if (extra.trim()) list.push({ reference: extra.trim(), description: "", widthCm: null, lengthCm: null });
    return list.filter((r) => r.reference);
  }, [items, checked, names, extra]);

  const send = async () => {
    if (refs.length === 0) { setError("Elige o escribe al menos una referencia"); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/panel/diseno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId, brief, dueDate: due || null, references: refs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo enviar"); return; }
      if (proof) {
        const fd = new FormData(); fd.append("file", proof);
        await fetch(`/api/panel/finanzas/${quotationId}/soporte`, { method: "POST", body: fd }).catch(() => {});
      }
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-[#051C46]">Pasar a diseño</h3>
        <p className="text-sm text-[#64748B]">Cotización {quotationNumber}. Se crea un arte por cada referencia marcada.</p>

        <div className="mt-4 space-y-2">
          {items.map((it, i) => (
            <label key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${checked[i] ? "border-[#051C46] bg-[#F8FAFC]" : "border-[#E2E8F0]"}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#D60517]" checked={Boolean(checked[i])} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} />
              <div className="flex-1">
                <input value={names[i] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [i]: e.target.value }))} className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm font-bold outline-none focus:border-[#051C46]" />
                <p className="mt-1 text-xs text-[#64748B]">{describe(it)}{/IMPRES/i.test(it.name) ? " · impreso" : ""}{existing.includes(names[i] ?? "") ? " · ya está en diseño" : ""}</p>
              </div>
            </label>
          ))}
          {items.length === 0 && <p className="rounded-xl bg-[#F8FAFC] p-3 text-xs text-[#64748B]">La cotización no tiene empaques; escribe la referencia abajo.</p>}
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="+ Otra referencia (opcional)" className="w-full rounded-xl border border-dashed border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:border-[#051C46]" />
        </div>

        <label className="mt-4 block text-xs font-semibold text-[#64748B]">Instrucciones para diseño</label>
        <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Logo y textos que van, colores, si el cliente envía el arte o hay que hacerlo desde cero…" className="mt-1 w-full rounded-xl border border-[#E2E8F0] p-3 text-sm outline-none focus:border-[#051C46]" />
        <label className="mt-3 block text-xs font-semibold text-[#64748B]">¿Para cuándo? (opcional)</label>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#051C46]" />

        {!paid && (
          <div className="mt-4 rounded-xl bg-[#FFF7ED] p-3 text-sm text-[#9A3412]">
            <p className="font-bold">Financiera debe confirmar el pago antes de que diseño empiece.</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#FDBA74] bg-white px-3 py-1.5 text-xs font-bold">
              {proof ? proof.name : hasProof ? "Cambiar comprobante (ya hay uno)" : "+ Adjuntar comprobante del cliente (opcional)"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        )}
        {error && <p className="mt-3 text-xs font-semibold text-[#DC2626]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#64748B]">Cancelar</button>
          <button onClick={send} disabled={busy || refs.length === 0} className="rounded-xl bg-[#D60517] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Enviando…" : `Enviar ${refs.length || ""} a diseño`}
          </button>
        </div>
      </div>
    </div>
  );
}
