"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MdContentCopy, MdLocalShipping, MdWarning } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { DeliveryForm } from "../../components/delivery-form";
import { Evidence } from "../../components/fulfillment-ui";

type Shipment = {
  mode: string; modeLabel: string; scheduledDate: string | null; address: string; city: string; contactName: string | null; contactPhone: string | null;
  driverName: string | null; driverPhone: string | null; vehiclePlate: string | null; carrierName: string | null; trackingNumber: string | null;
  packages: number | null; notes: string | null; token: string | null; dispatchedAt: string | null; deliveredAt: string | null;
  receiverName: string | null; receiverDoc: string | null; hasSignature: boolean; photos: number; deliveryNotes: string | null;
  incidents: { at: string; text: string }[];
};
type Order = {
  id: string; number: number; reference: string; description: string; quantity: number; dueDate: string | null; stage: string;
  quotation: { id: string; number: string; clientName: string; clientAddress: string | null; clientCity: string | null; clientContact: string | null; clientPhone: string | null; sellerName: string };
  shipment: Shipment | null;
};

const MODES = [
  { key: "PROPIO", label: "Vehículo propio" },
  { key: "TRANSPORTADORA", label: "Transportadora" },
  { key: "RECOGE", label: "El cliente recoge" },
];
const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#051C46]";
const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function driverLink(token: string) {
  return `${window.location.origin}/entrega/${token}`;
}

function LinkBox({ o, onClose }: { o: Order; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!o.shipment?.token || o.shipment.mode !== "PROPIO") return null;
  const url = driverLink(o.shipment.token);
  const phone = (o.shipment.driverPhone ?? "").replace(/\D/g, "");
  const text = `Hola ${o.shipment.driverName ?? ""}, entrega OP-${o.number} para ${o.quotation.clientName}. Abre este enlace para ver la dirección y registrar la entrega con firma y fotos: ${url}`;
  return (
    <div className="rounded-xl border-2 border-[#16A34A] bg-[#F0FDF4] p-4">
      <p className="text-sm font-black text-[#15803D]">Enlace para el conductor</p>
      <p className="mt-1 break-all rounded-lg bg-white px-2 py-1 font-mono text-xs text-[#334155]">{url}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#051C46] ring-1 ring-[#E2E8F0]">
          <MdContentCopy /> {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <a href={`https://wa.me/${phone.length === 10 ? "57" + phone : phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white">
          Enviar por WhatsApp
        </a>
        {onClose && <button onClick={onClose} className="ml-auto text-xs font-bold text-[#64748B]">Cerrar</button>}
      </div>
    </div>
  );
}

function DispatchForm({ o, onDone }: { o: Order; onDone: (o: Order, token: string | null) => void }) {
  const s = o.shipment;
  const [f, setF] = useState({
    mode: s?.mode ?? "PROPIO",
    scheduledDate: (s?.scheduledDate ?? o.dueDate ?? "").slice(0, 10),
    address: s?.address ?? o.quotation.clientAddress ?? "",
    city: s?.city ?? o.quotation.clientCity ?? "",
    contactName: s?.contactName ?? o.quotation.clientContact ?? "",
    contactPhone: s?.contactPhone ?? o.quotation.clientPhone ?? "",
    driverName: s?.driverName ?? "", driverPhone: s?.driverPhone ?? "", vehiclePlate: s?.vehiclePlate ?? "",
    carrierName: s?.carrierName ?? "", trackingNumber: s?.trackingNumber ?? "",
    packages: s?.packages ? String(s.packages) : "", notes: s?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/panel/despachos/${o.id}/despachar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, packages: f.packages ? Number(f.packages) : null, scheduledDate: f.scheduledDate || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo despachar"); return; }
      onDone(o, d.token);
    } finally { setBusy(false); }
  };

  const lbl = "text-xs font-semibold text-[#64748B]";
  return (
    <div className="space-y-3 border-t border-[#F1F5F9] bg-[#F8FAFC] p-5">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => set("mode", m.key)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${f.mode === m.key ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>{m.label}</button>
        ))}
      </div>
      {f.mode !== "RECOGE" && (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className={lbl}>Dirección de entrega<input className={`${input} mt-1`} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label className={lbl}>Ciudad<input className={`${input} mt-1`} value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
          <label className={lbl}>Fecha de entrega<input type="date" className={`${input} mt-1`} value={f.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} /></label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lbl}>Quién recibe<input className={`${input} mt-1`} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
        <label className={lbl}>Teléfono de contacto<input className={`${input} mt-1`} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></label>
        <label className={lbl}>Cajas / bultos<input inputMode="numeric" className={`${input} mt-1`} value={f.packages} onChange={(e) => set("packages", e.target.value.replace(/\D/g, ""))} /></label>
      </div>
      {f.mode === "PROPIO" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>Conductor<input className={`${input} mt-1`} value={f.driverName} onChange={(e) => set("driverName", e.target.value)} /></label>
          <label className={lbl}>Celular del conductor<input inputMode="tel" className={`${input} mt-1`} value={f.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} /></label>
          <label className={lbl}>Placa<input className={`${input} mt-1 uppercase`} value={f.vehiclePlate} onChange={(e) => set("vehiclePlate", e.target.value)} /></label>
        </div>
      )}
      {f.mode === "TRANSPORTADORA" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Transportadora<input className={`${input} mt-1`} value={f.carrierName} onChange={(e) => set("carrierName", e.target.value)} placeholder="Ej. Servientrega, TCC…" /></label>
          <label className={lbl}>No. de guía<input className={`${input} mt-1`} value={f.trackingNumber} onChange={(e) => set("trackingNumber", e.target.value)} /></label>
        </div>
      )}
      <label className={`${lbl} block`}>Indicaciones (las ve el conductor)<input className={`${input} mt-1`} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ej. entregar por portería de carga, horario 7–11 a. m." /></label>
      {error && <p className="text-xs font-semibold text-[#DC2626]">{error}</p>}
      <div className="flex justify-end">
        <button disabled={busy} onClick={send} className="inline-flex items-center gap-1 rounded-xl bg-[#D60517] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">
          <MdLocalShipping size={18} /> {s ? "Guardar cambios" : f.mode === "PROPIO" ? "Despachar y generar enlace" : "Despachar"}
        </button>
      </div>
    </div>
  );
}

export default function DespachosPage() {
  const [data, setData] = useState<{ coordinate: Order[]; transit: Order[]; done: Order[] } | null>(null);
  const [tab, setTab] = useState<"coordinate" | "transit" | "done">("coordinate");
  const [open, setOpen] = useState<{ id: string; mode: "dispatch" | "deliver" } | null>(null);
  const [justDispatched, setJustDispatched] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/panel/despachos").then((r) => r.json()).catch(() => null);
    setData(d && !d.error ? d : { coordinate: [], transit: [], done: [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["fulfillment"], load);

  if (!data) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></div>;
  const list = data[tab];
  const TABS = [
    { key: "coordinate" as const, label: "Por coordinar", n: data.coordinate.length },
    { key: "transit" as const, label: "En entrega", n: data.transit.length },
    { key: "done" as const, label: "Entregados", n: 0 },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Logística</p>
        <h1 className="mt-1 text-2xl font-black text-[#051C46]">Despachos</h1>
        <p className="mt-0.5 text-sm text-[#64748B]">Llegan cuando financiera verifica el saldo. Coordina el envío y el conductor registra la entrega con firma y fotos.</p>
      </div>
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpen(null); }} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === t.key ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#475569]"}`}>
            {t.label} {t.n > 0 && <span className="ml-1 rounded-full bg-[#D60517] px-1.5 text-xs text-white">{t.n}</span>}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#94A3B8]">
          {tab === "coordinate" ? "No hay pedidos por despachar." : tab === "transit" ? "No hay entregas en curso." : "Aún no hay entregas."}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((o) => {
            const sh = o.shipment;
            const isOpen = open?.id === o.id;
            return (
              <article key={o.id} className={`overflow-hidden rounded-2xl border bg-white ${isOpen ? "border-2 border-[#051C46]" : "border-[#E2E8F0]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/panel/planta/${o.id}`} className="text-sm font-black text-[#D60517] hover:underline">OP-{o.number}</Link>
                      <span className="text-lg font-black text-[#051C46]">{o.quotation.clientName}</span>
                    </div>
                    <p className="text-sm text-[#334155]">{o.reference} · {o.quantity.toLocaleString("es-CO")} und{sh?.packages ? ` · ${sh.packages} cajas` : ""}</p>
                    {sh ? (
                      <p className="mt-1 text-xs text-[#64748B]">
                        <b>{sh.modeLabel}</b>
                        {sh.mode === "PROPIO" && ` · ${sh.driverName ?? ""}${sh.vehiclePlate ? ` (${sh.vehiclePlate})` : ""}`}
                        {sh.mode === "TRANSPORTADORA" && ` · ${sh.carrierName ?? ""}${sh.trackingNumber ? ` · guía ${sh.trackingNumber}` : ""}`}
                        {sh.address && ` · ${sh.address}${sh.city ? `, ${sh.city}` : ""}`}
                        {sh.dispatchedAt && ` · salió ${when(sh.dispatchedAt)}`}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[#64748B]">{[o.quotation.clientAddress, o.quotation.clientCity].filter(Boolean).join(", ") || "Sin dirección en la cotización"} · {o.quotation.sellerName}</p>
                    )}
                    {sh && sh.incidents.length > 0 && tab === "transit" && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#FEE2E2] px-2 py-1 text-xs font-bold text-[#DC2626]">
                        <MdWarning /> {sh.incidents[sh.incidents.length - 1].text} · {when(sh.incidents[sh.incidents.length - 1].at)}
                      </p>
                    )}
                    {tab === "done" && sh?.deliveredAt && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-[#15803D]"><b>Recibió {sh.receiverName}</b>{sh.receiverDoc ? ` (C.C. ${sh.receiverDoc})` : ""} · {when(sh.deliveredAt)} {o.stage === "CLOSED" ? "· finalizado" : "· falta que financiera finalice"}</p>
                        <Evidence orderId={o.id} hasSignature={sh.hasSignature} photos={sh.photos} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {(o.dueDate || sh?.scheduledDate) && <span className="text-xs font-bold text-[#64748B]">Entrega {day((sh?.scheduledDate ?? o.dueDate)!)}</span>}
                    {tab === "coordinate" && !isOpen && (
                      <button onClick={() => setOpen({ id: o.id, mode: "dispatch" })} className="rounded-xl bg-[#D60517] px-4 py-2 text-sm font-black text-white">Coordinar envío</button>
                    )}
                    {tab === "transit" && !isOpen && (
                      <div className="flex gap-2">
                        <button onClick={() => setOpen({ id: o.id, mode: "dispatch" })} className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-bold text-[#334155]">Editar</button>
                        {sh?.mode === "PROPIO" && <button onClick={() => setJustDispatched(justDispatched === o.id ? null : o.id)} className="rounded-xl border border-[#16A34A] px-3 py-2 text-xs font-bold text-[#15803D]">Enlace del conductor</button>}
                        <button onClick={() => setOpen({ id: o.id, mode: "deliver" })} className="rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-black text-white">Registrar entrega</button>
                      </div>
                    )}
                  </div>
                </div>
                {justDispatched === o.id && <div className="px-5 pb-4"><LinkBox o={o} onClose={() => setJustDispatched(null)} /></div>}
                {isOpen && open.mode === "dispatch" && (
                  <DispatchForm o={o} onDone={async (ord, token) => { setOpen(null); await load(); setTab("transit"); if (token && ord) setJustDispatched(ord.id); }} />
                )}
                {isOpen && open.mode === "deliver" && (
                  <div className="border-t border-[#F1F5F9] bg-[#F8FAFC] p-5">
                    <div className="mb-3 flex justify-between"><p className="font-black text-[#051C46]">Registrar entrega</p><button onClick={() => setOpen(null)} className="text-sm font-bold text-[#64748B]">Cancelar</button></div>
                    <DeliveryForm endpoint={`/api/panel/despachos/${o.id}/entrega`} onDone={() => { setOpen(null); load(); }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
