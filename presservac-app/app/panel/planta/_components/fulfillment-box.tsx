"use client";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { Evidence, StageStepper } from "../../../components/fulfillment-ui";

type F = {
  stage: string; balanceNote: string | null;
  money: { total: number; paid: number; balance: number };
  shipment: { modeLabel: string; driverName: string | null; vehiclePlate: string | null; carrierName: string | null; trackingNumber: string | null; dispatchedAt: string | null; deliveredAt: string | null; receiverName: string | null; hasSignature: boolean; photos: number; incidents: { at: string; text: string }[] } | null;
  caps: { canRelease: boolean };
};

const NEXT: Record<string, string> = {
  BALANCE_CHECK: "Financiera está verificando el saldo del cliente.",
  LOGISTICS: "Logística está coordinando el envío.",
  IN_TRANSIT: "Va en camino.",
  DELIVERED: "Entregado; financiera debe finalizar el pedido.",
  CLOSED: "Pedido finalizado.",
};

/** Lo que pasa después de producción: liberar → saldo → logística → entrega → cierre. */
export function FulfillmentBox({ orderId }: { orderId: string }) {
  const [f, setF] = useState<F | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/panel/despachos/${orderId}`);
    if (r.ok) setF(await r.json());
  }, [orderId]);
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["fulfillment"], load);

  const release = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`/api/panel/planta/${orderId}/liberar`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "No se pudo liberar"); return; }
    load();
  };

  if (!f) return null;
  const sh = f.shipment;
  return (
    <section className="rounded-2xl border-2 border-[#16A34A] bg-white p-5">
      <p className="text-lg font-black text-[#15803D]">✓ Producción terminada</p>
      <div className="mt-3 overflow-x-auto"><StageStepper stage={f.stage} /></div>
      {f.stage === "PRODUCTION" ? (
        f.caps.canRelease ? (
          <button disabled={busy} onClick={release} className="mt-4 w-full rounded-xl bg-[#D60517] py-3 text-sm font-black text-white disabled:opacity-50">
            Liberar a despacho →
          </button>
        ) : <p className="mt-3 text-sm text-[#64748B]">Falta que el jefe de producción la libere a despacho.</p>
      ) : <p className="mt-3 text-sm font-semibold text-[#334155]">{NEXT[f.stage]}</p>}
      {f.stage === "BALANCE_CHECK" && f.balanceNote && <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-1.5 text-xs text-[#92400E]">Financiera: “{f.balanceNote}”</p>}
      {sh && (
        <div className="mt-3 space-y-2 text-xs text-[#64748B]">
          <p>{sh.modeLabel}{sh.driverName ? ` · ${sh.driverName}` : ""}{sh.vehiclePlate ? ` (${sh.vehiclePlate})` : ""}{sh.carrierName ? ` · ${sh.carrierName}` : ""}{sh.trackingNumber ? ` · guía ${sh.trackingNumber}` : ""}</p>
          {sh.incidents.length > 0 && !sh.deliveredAt && <p className="font-bold text-[#DC2626]">Novedad: {sh.incidents[sh.incidents.length - 1].text}</p>}
          {sh.deliveredAt && <p className="text-[#15803D]">Recibió <b>{sh.receiverName}</b> · {new Date(sh.deliveredAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}
          {sh.deliveredAt && <Evidence orderId={orderId} hasSignature={sh.hasSignature} photos={sh.photos} />}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-[#DC2626]">{error}</p>}
    </section>
  );
}
