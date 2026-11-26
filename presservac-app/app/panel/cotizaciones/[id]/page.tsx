"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { QuoteBuilder, toBuilderInitial, type BuilderInitial } from "../_components/quote-builder";
import { DesignPanel } from "../_components/design-panel";

type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";

const STATUS_META: Record<QuotationStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: "Borrador", color: "#64748B", bg: "#F1F5F9" },
  SENT:     { label: "Enviada",  color: "#D97706", bg: "#FEF3C7" },
  APPROVED: { label: "Aprobada", color: "#16A34A", bg: "#DCFCE7" },
  REJECTED: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2" },
  EXPIRED:  { label: "Vencida",  color: "#94A3B8", bg: "#F1F5F9" },
};

type Detail = Parameters<typeof toBuilderInitial>[0] & {
  status: QuotationStatus; createdAt: string; convertedOrderId: string | null; seller: { fullName: string };
};

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState<Detail | null>(null);
  const [initial, setInitial] = useState<BuilderInitial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const load = useCallback(async () => {
    const d = await fetch(`/api/panel/quotations/${id}`).then((r) => r.json()).catch(() => null);
    if (!d || d.error) { setError(d?.error ?? "No se pudo cargar la cotización"); return; }
    setQ(d);
    // El formulario solo se reinicia al cargar, no en cada refresco en vivo.
    setInitial((prev) => prev ?? toBuilderInitial(d));
    setFrameKey((k) => k + 1);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const { markLocalWrite } = useRealtimeRefresh(["quotations"], load);

  const action = async (name: "send" | "approve" | "reject" | "convert") => {
    if (name === "send" && dirty) { setError("Guarda los cambios antes de marcarla como enviada."); return; }
    setBusy(true);
    setError(null);
    try {
      markLocalWrite();
      const r = await fetch(`/api/panel/quotations/${id}/${name}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "No se pudo completar la acción"); return; }
      if (name === "convert") { router.push("/panel/pedidos"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const r = await fetch(`/api/panel/quotations/${id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) router.push("/panel/cotizaciones");
    else setError("No se pudo eliminar");
  };

  const downloadPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/panel/quotations/${id}/pdf`, { method: "POST" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "No se pudo generar el PDF"); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cotizacion-${q?.number ?? ""}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  if (!q || !initial) {
    return (
      <div className="flex h-64 items-center justify-center">
        {error ? <p className="text-sm font-semibold text-[#DC2626]">{error}</p> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" />}
      </div>
    );
  }

  const meta = STATUS_META[q.status];
  const isDraft = q.status === "DRAFT";
  const btn = "rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60";

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/panel/cotizaciones" className="text-xs font-bold text-[#94A3B8] hover:text-[#1A1A1A]">← Cotizaciones</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#051C46]">Cotización No. {q.number}</h1>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-[#64748B]">{q.clientName} · {new Date(q.createdAt).toLocaleDateString("es-CO")} · {q.seller.fullName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <button onClick={() => setConfirmDelete(true)} disabled={busy} className={`${btn} text-[#DC2626] hover:bg-[#FEE2E2]`}>Eliminar</button>
              <button onClick={() => action("send")} disabled={busy} className={`${btn} bg-[#051C46] text-white hover:opacity-90`}>Ya la envié al cliente</button>
            </>
          )}
          {!isDraft && (
            <>
              <Link href={`/panel/cotizaciones/nueva?desde=${id}`} className={`${btn} border border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC]`}>Duplicar</Link>
              <button onClick={downloadPdf} disabled={busy} className={`${btn} border border-[#051C46] text-[#051C46] hover:bg-[#F1F5F9]`}>Descargar PDF</button>
            </>
          )}
          {q.status === "SENT" && (
            <>
              <button onClick={() => action("reject")} disabled={busy} className={`${btn} border border-[#DC2626] text-[#DC2626] hover:bg-[#FEE2E2]`}>No la aceptó</button>
              <button onClick={() => action("approve")} disabled={busy} className={`${btn} bg-[#16A34A] text-white hover:bg-[#15803D]`}>La aprobó</button>
            </>
          )}
          {q.status === "APPROVED" && !q.convertedOrderId && (
            <button onClick={() => action("convert")} disabled={busy} className={`${btn} bg-[#D60517] text-white hover:bg-[#B00413]`}>Convertir a pedido →</button>
          )}
          {q.convertedOrderId && <span className={`${btn} bg-[#FDEEEF] text-[#051C46]`}>Ya es pedido</span>}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#DC2626]">
          <span>{error}</span><button onClick={() => setError(null)} className="font-black">×</button>
        </div>
      )}

      <DesignPanel quotationId={id} quotationNumber={q.number} closed={q.status === "REJECTED" || q.status === "EXPIRED"} />

      {isDraft ? (
        <QuoteBuilder initial={initial} onDirtyChange={setDirty} onSaved={() => load()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
          <iframe key={frameKey} src={`/imprimir-cotizacion/${id}`} title={`Cotización ${q.number}`} className="h-[1100px] w-full" />
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-black text-[#051C46]">¿Eliminar la cotización {q.number}?</h3>
            <p className="mt-2 text-sm text-[#64748B]">Se borra el borrador y no se puede recuperar.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className={`${btn} border border-[#E2E8F0] text-[#64748B]`}>Cancelar</button>
              <button onClick={remove} disabled={busy} className={`${btn} bg-[#DC2626] text-white`}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
