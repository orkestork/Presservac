"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MdAttachFile, MdCheck, MdReceiptLong } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { BalanceCard, CloseCard, type FOrder } from "./_fulfillment";

type Payment = {
  id: string; kind: string; kindLabel: string; amount: number; methodLabel: string | null; reference: string | null;
  paidAt: string; hasReceipt: boolean; notes: string | null; confirmedBy: string;
};
type Item = {
  id: string; number: string; clientName: string; clientNit: string | null; sellerName: string; paymentTerms: string | null;
  requestedAt: string | null; confirmedAt: string | null; financeNote: string | null;
  proof: { name: string | null; mime: string | null } | null;
  references: string[]; total: number; paid: number; payments: Payment[];
};

const fmt = (n: number) => (n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const KINDS = [
  { key: "ANTICIPO", label: "Anticipo 50%" },
  { key: "TOTAL", label: "Pago total" },
  { key: "CREDITO", label: "Crédito aprobado" },
];
const METHODS = [
  { key: "TRANSFERENCIA", label: "Transferencia" },
  { key: "CONSIGNACION", label: "Consignación" },
  { key: "EFECTIVO", label: "Efectivo" },
  { key: "TARJETA", label: "Tarjeta" },
  { key: "OTRO", label: "Otro" },
];
const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#051C46]";

function ago(iso: string | null, now: number) {
  if (!iso) return "";
  const h = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "hace un momento" : h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} días`;
}

function PendingCard({ q, now, onDone }: { q: Item; now: number; onDone: () => void }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const [mode, setMode] = useState<"none" | "confirm" | "pending">("none");
  const [kind, setKind] = useState("ANTICIPO");
  const [amount, setAmount] = useState(String(Math.round(q.total / 2)));
  const [method, setMethod] = useState("TRANSFERENCIA");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickKind = (k: string) => {
    setKind(k);
    setAmount(k === "ANTICIPO" ? String(Math.round(q.total / 2)) : k === "TOTAL" ? String(q.total) : "0");
  };

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind); fd.append("amount", amount.replace(/\D/g, "") || "0"); fd.append("method", kind === "CREDITO" ? "" : method);
      fd.append("paidAt", paidAt); fd.append("reference", reference); fd.append("notes", notes);
      if (file) fd.append("file", file);
      const r = await fetch(`/api/panel/finanzas/${q.id}/confirmar`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo confirmar"); return; }
      onDone();
    } finally { setBusy(false); }
  };

  const markPending = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/panel/finanzas/${q.id}/pendiente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo enviar"); return; }
      setMode("none"); setNote(""); onDone();
    } finally { setBusy(false); }
  };

  return (
    <article className={`rounded-2xl border bg-white ${mode === "confirm" ? "border-2 border-[#16A34A]" : "border-[#E2E8F0]"}`}>
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/panel/cotizaciones/${q.id}`} className="text-sm font-black text-[#D60517] hover:underline">Cot. {q.number}</Link>
            <span className="text-lg font-black text-[#051C46]">{q.clientName}</span>
            {q.clientNit && <span className="text-xs text-[#94A3B8]">NIT {q.clientNit}</span>}
          </div>
          <p className="text-xs text-[#64748B]">{q.sellerName} lo pidió {ago(q.requestedAt, now)} · Condición: {q.paymentTerms || "—"}</p>
          {q.references.length > 0 && (
            <p className="mt-2 text-xs text-[#64748B]">Diseño espera: {q.references.map((r) => <span key={r} className="mr-1 rounded-full bg-[#FFEDD5] px-2 py-0.5 font-bold text-[#B45309]">{r}</span>)}</p>
          )}
          {q.financeNote && <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-1.5 text-xs text-[#92400E]">Le dijiste a comercial: “{q.financeNote}”</p>}
        </div>
        <div className="flex items-start gap-6 text-right">
          <div><p className="text-[10px] font-bold uppercase text-[#94A3B8]">Total + IVA</p><p className="text-lg font-black text-[#051C46]">{fmt(q.total)}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[#94A3B8]">Anticipo 50%</p><p className="text-lg font-black text-[#334155]">{fmt(q.total / 2)}</p></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] px-5 py-3">
        {q.proof ? (
          <a href={`/api/panel/finanzas/${q.id}/soporte`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-[#F1F5F9] px-3 py-2 text-sm font-bold text-[#051C46] hover:bg-[#E2E8F0]">
            <MdReceiptLong /> Ver comprobante que envió comercial
          </a>
        ) : <span className="text-xs text-[#94A3B8]">Comercial no adjuntó comprobante</span>}
        <div className="ml-auto flex gap-2">
          {mode === "none" && (
            <>
              <button onClick={() => setMode("pending")} className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]">Aún no llega</button>
              <button onClick={() => setMode("confirm")} className="rounded-xl bg-[#16A34A] px-5 py-2 text-sm font-black text-white hover:bg-[#15803D]">Confirmar pago</button>
            </>
          )}
        </div>
      </div>

      {mode === "pending" && (
        <div className="flex flex-wrap gap-2 border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-4">
          <input autoFocus className={`${input} flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. No aparece la transferencia en el banco; confirmar con el cliente" />
          <button onClick={() => setMode("none")} className="px-3 text-sm font-bold text-[#64748B]">Cancelar</button>
          <button disabled={busy || !note.trim()} onClick={markPending} className="rounded-xl bg-[#051C46] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Avisar a comercial</button>
        </div>
      )}

      {mode === "confirm" && (
        <div className="space-y-3 border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k.key} onClick={() => pickKind(k.key)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${kind === k.key ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>{k.label}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-[#64748B]">{kind === "CREDITO" ? "Cupo / monto (opcional)" : "Monto recibido"}
              <input inputMode="numeric" className={`${input} mt-1 text-right text-base font-bold`} value={amount ? Number(amount.replace(/\D/g, "") || 0).toLocaleString("es-CO") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="text-xs font-semibold text-[#64748B]">Fecha del pago
              <input type="date" className={`${input} mt-1`} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-[#64748B]">Referencia / No. de transacción
              <input className={`${input} mt-1`} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          {kind !== "CREDITO" && (
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button key={m.key} onClick={() => setMethod(m.key)} className={`rounded-full border px-3 py-1 text-xs font-bold ${method === m.key ? "border-[#051C46] bg-white text-[#051C46] ring-1 ring-[#051C46]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}>{m.label}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#475569] hover:border-[#051C46]">
              <MdAttachFile /> {file ? file.name : q.proof ? "Otro soporte (opcional; ya está el de comercial)" : "Adjuntar soporte (opcional)"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <input className={`${input} min-w-48 flex-1`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota (opcional)" />
          </div>
          {error && <p className="text-xs font-semibold text-[#DC2626]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setMode("none")} className="px-3 text-sm font-bold text-[#64748B]">Cancelar</button>
            <button disabled={busy} onClick={confirm} className="inline-flex items-center gap-1 rounded-xl bg-[#16A34A] px-5 py-2.5 text-sm font-black text-white hover:bg-[#15803D] disabled:opacity-50">
              <MdCheck size={18} /> Confirmar y liberar a diseño
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function FinanzasPage() {
  const [data, setData] = useState<{ pending: Item[]; confirmed: Item[] } | null>(null);
  const [tab, setTab] = useState<"pending" | "balance" | "close" | "confirmed">("pending");
  const [ff, setFf] = useState<{ balance: FOrder[]; toClose: FOrder[]; closed: FOrder[] }>({ balance: [], toClose: [], closed: [] });
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/panel/finanzas").then((r) => r.json()).catch(() => null);
    setData(d && !d.error ? d : { pending: [], confirmed: [] });
    const f = await fetch("/api/panel/finanzas/saldos").then((r) => r.json()).catch(() => null);
    if (f && !f.error) setFf(f);
    setNow(Date.now());
  }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["payments", "fulfillment"], load);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "saldos") setTab("balance");
    if (t === "cerrar") setTab("close");
  }, []);
  const done = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2500); load(); };

  if (!data) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></div>;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Financiera</p>
        <h1 className="mt-1 text-2xl font-black text-[#051C46]">Pagos de clientes</h1>
        <p className="mt-0.5 text-sm text-[#64748B]">Anticipo antes de diseño, saldo antes de despachar y cierre del pedido después de la entrega.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["pending", "Anticipos por confirmar", data.pending.length],
          ["balance", "Saldos antes de despacho", ff.balance.length],
          ["close", "Entregados por finalizar", ff.toClose.length],
          ["confirmed", "Historial", 0],
        ] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === k ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>
            {l} {n > 0 && <span className="ml-1 rounded-full bg-[#D60517] px-1.5 text-xs text-white">{n}</span>}
          </button>
        ))}
      </div>
      {flash && <p className="mb-4 rounded-xl bg-[#DCFCE7] px-3 py-2 text-sm font-semibold text-[#15803D]">✓ {flash}</p>}

      {tab === "balance" ? (
        ff.balance.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#94A3B8]">Nada por verificar. Llegan cuando producción libera una orden terminada.</p>
          : <div className="space-y-3">{ff.balance.map((o) => <BalanceCard key={o.id} o={o} onDone={done} />)}</div>
      ) : tab === "close" ? (
        <div className="space-y-3">
          {ff.toClose.length === 0 && <p className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#94A3B8]">No hay entregas por finalizar.</p>}
          {ff.toClose.map((o) => <CloseCard key={o.id} o={o} onDone={done} />)}
          {ff.closed.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Finalizados recientes</p>
              <div className="divide-y divide-[#F1F5F9] rounded-2xl border border-[#E2E8F0] bg-white">
                {ff.closed.map((o) => (
                  <Link key={o.id} href={`/panel/planta/${o.id}`} className="flex justify-between px-4 py-3 text-sm hover:bg-[#F8FAFC]">
                    <span><b className="text-[#D60517]">OP-{o.number}</b> · {o.quotation.clientName} · {o.reference}</span>
                    <span className="text-xs text-[#64748B]">{o.closedAt && new Date(o.closedAt).toLocaleDateString("es-CO")}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === "pending" ? (
        data.pending.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center">
            <p className="text-lg font-black text-[#051C46]">Nada por confirmar</p>
            <p className="mt-1 text-sm text-[#64748B]">Aparecen aquí cuando comercial pasa una cotización a diseño.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.pending.map((q) => (
              <PendingCard key={q.id} q={q} now={now} onDone={() => { setFlash(`Listo: cotización ${q.number}`); setTimeout(() => setFlash(null), 2500); load(); }} />
            ))}
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-[#F8FAFC] text-left text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">
              <tr>{["Cotización", "Cliente", "Tipo", "Monto", "Fecha", "Medio / ref.", "Confirmó", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.confirmed.flatMap((q) => q.payments.map((p) => (
                <tr key={p.id} className="border-t border-[#F1F5F9]">
                  <td className="px-4 py-3"><Link href={`/panel/cotizaciones/${q.id}`} className="font-bold text-[#D60517] hover:underline">{q.number}</Link></td>
                  <td className="px-4 py-3 font-semibold text-[#1A1A1A]">{q.clientName}</td>
                  <td className="px-4 py-3">{p.kindLabel}</td>
                  <td className="px-4 py-3 font-bold">{p.amount ? fmt(p.amount) : "—"}</td>
                  <td className="px-4 py-3 text-[#64748B]">{new Date(p.paidAt).toLocaleDateString("es-CO", { timeZone: "UTC" })}</td>
                  <td className="px-4 py-3 text-[#64748B]">{[p.methodLabel, p.reference].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3 text-[#64748B]">{p.confirmedBy}</td>
                  <td className="px-4 py-3">{p.hasReceipt && <a href={`/api/panel/finanzas/${q.id}/soporte?pago=${p.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#051C46] hover:underline">Soporte</a>}</td>
                </tr>
              )))}
              {data.confirmed.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#94A3B8]">Todavía no hay pagos confirmados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
