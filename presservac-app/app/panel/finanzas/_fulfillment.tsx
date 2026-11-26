"use client";
import { useState } from "react";
import Link from "next/link";
import { MdAttachFile, MdCheck } from "react-icons/md";
import { Evidence } from "../../components/fulfillment-ui";

export type FOrder = {
  id: string; number: number; reference: string; quantity: number; stage: string; releasedAt: string | null; balanceNote: string | null; closedAt: string | null;
  quotation: { id: string; number: string; clientName: string; clientNit: string | null; sellerName: string; paymentTerms: string | null };
  money: { total: number; paid: number; balance: number; credit: boolean; payments: { id: string; kind: string; amount: number; method: string | null; reference: string | null; paidAt: string }[] };
  shipment: { modeLabel: string; deliveredAt: string | null; receiverName: string | null; receiverDoc: string | null; hasSignature: boolean; photos: number; deliveryNotes: string | null; driverName: string | null; carrierName: string | null; trackingNumber: string | null } | null;
};

const fmt = (n: number) => (n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#051C46]";
const METHODS = [["TRANSFERENCIA", "Transferencia"], ["CONSIGNACION", "Consignación"], ["EFECTIVO", "Efectivo"], ["TARJETA", "Tarjeta"], ["OTRO", "Otro"]];

function Money({ o }: { o: FOrder }) {
  return (
    <div className="flex gap-5 text-right">
      <div><p className="text-[10px] font-bold uppercase text-[#94A3B8]">Total + IVA</p><p className="font-black text-[#051C46]">{fmt(o.money.total)}</p></div>
      <div><p className="text-[10px] font-bold uppercase text-[#94A3B8]">Pagado</p><p className="font-black text-[#15803D]">{fmt(o.money.paid)}</p></div>
      <div><p className="text-[10px] font-bold uppercase text-[#94A3B8]">Saldo</p><p className={`text-lg font-black ${o.money.balance > 0 ? "text-[#D60517]" : "text-[#15803D]"}`}>{o.money.balance > 0 ? fmt(o.money.balance) : "Al día"}</p></div>
    </div>
  );
}

function Header({ o }: { o: FOrder }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/panel/planta/${o.id}`} className="text-sm font-black text-[#D60517] hover:underline">OP-{o.number}</Link>
        <span className="text-lg font-black text-[#051C46]">{o.quotation.clientName}</span>
        {o.quotation.clientNit && <span className="text-xs text-[#94A3B8]">NIT {o.quotation.clientNit}</span>}
      </div>
      <p className="text-xs text-[#64748B]">{o.reference} · {o.quantity.toLocaleString("es-CO")} und · Cot. {o.quotation.number} · {o.quotation.sellerName}</p>
      {o.money.payments.length > 0 && (
        <p className="mt-1 text-xs text-[#64748B]">Pagos: {o.money.payments.map((p) => `${p.kind}${p.amount ? ` ${fmt(p.amount)}` : ""}`).join(" · ")}</p>
      )}
    </div>
  );
}

export function BalanceCard({ o, onDone }: { o: FOrder; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"none" | "approve" | "pending">("none");
  const [kind, setKind] = useState<"SALDO" | "PAGADO" | "CREDITO">(o.money.balance > 0 ? "SALDO" : "PAGADO");
  const [amount, setAmount] = useState(String(o.money.balance));
  const [method, setMethod] = useState("TRANSFERENCIA");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind); fd.append("amount", amount.replace(/\D/g, "") || "0"); fd.append("method", kind === "SALDO" ? method : "");
      fd.append("paidAt", paidAt); fd.append("reference", reference); if (file) fd.append("file", file);
      const r = await fetch(`/api/panel/finanzas/saldos/${o.id}/aprobar`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo aprobar"); return; }
      onDone(`OP-${o.number} pasó a logística`);
    } finally { setBusy(false); }
  };
  const pending = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/panel/finanzas/saldos/${o.id}/pendiente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo enviar"); return; }
      setMode("none"); onDone(`Aviso enviado a ${o.quotation.sellerName}`);
    } finally { setBusy(false); }
  };

  return (
    <article className={`overflow-hidden rounded-2xl border bg-white ${mode === "approve" ? "border-2 border-[#16A34A]" : "border-[#E2E8F0]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div><Header o={o} />{o.balanceNote && <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-1.5 text-xs text-[#92400E]">Le dijiste a comercial: “{o.balanceNote}”</p>}</div>
        <Money o={o} />
      </div>
      {mode === "none" && (
        <div className="flex justify-end gap-2 border-t border-[#F1F5F9] px-5 py-3">
          <button onClick={() => setMode("pending")} className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#334155]">Aún no paga</button>
          <button onClick={() => setMode("approve")} className="rounded-xl bg-[#16A34A] px-5 py-2 text-sm font-black text-white">Aprobar despacho</button>
        </div>
      )}
      {mode === "pending" && (
        <div className="flex flex-wrap gap-2 border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-4">
          <input autoFocus className={`${input} flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Falta el 50 % restante; no se despacha hasta que pague" />
          <button onClick={() => setMode("none")} className="px-3 text-sm font-bold text-[#64748B]">Cancelar</button>
          <button disabled={busy || !note.trim()} onClick={pending} className="rounded-xl bg-[#051C46] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Avisar a comercial</button>
        </div>
      )}
      {mode === "approve" && (
        <div className="space-y-3 border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {([["SALDO", "Recibí el saldo"], ["PAGADO", "Ya estaba todo pagado"], ["CREDITO", "Despachar a crédito"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${kind === k ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>{l}</button>
            ))}
          </div>
          {kind === "SALDO" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-[#64748B]">Monto recibido
                  <input inputMode="numeric" className={`${input} mt-1 text-right font-bold`} value={amount ? Number(amount.replace(/\D/g, "") || 0).toLocaleString("es-CO") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="text-xs font-semibold text-[#64748B]">Fecha<input type="date" className={`${input} mt-1`} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
                <label className="text-xs font-semibold text-[#64748B]">Referencia<input className={`${input} mt-1`} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {METHODS.map(([k, l]) => (
                  <button key={k} onClick={() => setMethod(k)} className={`rounded-full border px-3 py-1 text-xs font-bold ${method === k ? "border-[#051C46] bg-white text-[#051C46] ring-1 ring-[#051C46]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}>{l}</button>
                ))}
                <label className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-[#CBD5E1] bg-white px-3 py-1.5 text-xs text-[#475569]">
                  <MdAttachFile /> {file ? file.name : "Soporte (opcional)"}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </>
          )}
          {kind === "PAGADO" && o.money.balance > 0 && <p className="text-xs font-bold text-[#B45309]">Ojo: según los pagos registrados aún hay saldo de {fmt(o.money.balance)}.</p>}
          {kind === "CREDITO" && <p className="text-xs text-[#64748B]">Se despacha y el saldo queda por cobrar.</p>}
          {error && <p className="text-xs font-semibold text-[#DC2626]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setMode("none")} className="px-3 text-sm font-bold text-[#64748B]">Cancelar</button>
            <button disabled={busy} onClick={approve} className="inline-flex items-center gap-1 rounded-xl bg-[#16A34A] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><MdCheck size={18} /> Pasar a logística</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function CloseCard({ o, onDone }: { o: FOrder; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sh = o.shipment;
  const close = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/panel/finanzas/saldos/${o.id}/cerrar`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo finalizar"); return; }
      onDone(`Pedido OP-${o.number} finalizado`);
    } finally { setBusy(false); }
  };
  return (
    <article className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <Header o={o} />
        <Money o={o} />
      </div>
      {sh && (
        <div className="border-t border-[#F1F5F9] px-5 py-4">
          <p className="mb-2 text-sm text-[#334155]">
            <b>Entregado</b> {sh.deliveredAt && new Date(sh.deliveredAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {sh.modeLabel}
            {sh.driverName ? ` · ${sh.driverName}` : ""}{sh.carrierName ? ` · ${sh.carrierName}${sh.trackingNumber ? ` guía ${sh.trackingNumber}` : ""}` : ""}
            {" · "}recibió <b>{sh.receiverName}</b>{sh.receiverDoc ? ` (C.C. ${sh.receiverDoc})` : ""}
          </p>
          {sh.deliveryNotes && <p className="mb-2 text-xs text-[#64748B]">“{sh.deliveryNotes}”</p>}
          <Evidence orderId={o.id} hasSignature={sh.hasSignature} photos={sh.photos} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-3">
        <span className="text-xs text-[#64748B]">{o.money.balance > 0 ? (o.money.credit ? `Saldo a crédito por cobrar: ${fmt(o.money.balance)}` : `Ojo: saldo pendiente ${fmt(o.money.balance)}`) : "Pagado completo"}</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs font-semibold text-[#DC2626]">{error}</span>}
          <button disabled={busy} onClick={close} className="rounded-xl bg-[#051C46] px-5 py-2 text-sm font-black text-white disabled:opacity-50">Finalizar pedido</button>
        </div>
      </div>
    </article>
  );
}
