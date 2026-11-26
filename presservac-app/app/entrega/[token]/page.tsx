"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DeliveryForm } from "../../components/delivery-form";

type Info = {
  number: number; reference: string; description: string; quantity: number; clientName: string; stage: string;
  address: string; city: string; contactName: string | null; contactPhone: string | null; packages: number | null; notes: string | null;
  driverName: string | null; scheduledDate: string | null; deliveredAt: string | null; receiverName: string | null;
};

export default function EntregaPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"info" | "deliver" | "incident">("info");
  const [incident, setIncident] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/entrega/${token}`, { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) { setError(d?.error ?? "Enlace no válido"); return; }
    setInfo(d);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const sendIncident = async () => {
    const r = await fetch(`/api/entrega/${token}/novedad`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: incident }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? "No se pudo enviar"); return; }
    setIncident(""); setView("info"); setSent("Novedad enviada a logística.");
  };

  if (error && !info) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F1F5F9] p-6 text-center"><div><p className="text-xl font-black text-[#051C46]">{error}</p><p className="mt-2 text-sm text-[#64748B]">Pide a logística un enlace nuevo.</p></div></main>;
  }
  if (!info) return <main className="flex min-h-screen items-center justify-center bg-[#F1F5F9]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></main>;

  const delivered = info.stage !== "IN_TRANSIT";
  const fullAddress = [info.address, info.city].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#F1F5F9] pb-10">
      <header className="bg-[#051C46] px-5 pb-6 pt-5 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-white/60">Presservac · Entrega OP-{info.number}</p>
        <h1 className="mt-1 text-2xl font-black">{info.clientName}</h1>
        {info.driverName && <p className="text-sm text-white/70">Conductor: {info.driverName}</p>}
      </header>

      <div className="mx-auto -mt-3 max-w-lg space-y-4 px-4">
        {sent && <p className="rounded-xl bg-[#DCFCE7] px-4 py-3 text-sm font-bold text-[#15803D]">{sent}</p>}

        {delivered ? (
          <section className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-5xl">✓</p>
            <p className="mt-2 text-xl font-black text-[#15803D]">Entrega registrada</p>
            <p className="mt-1 text-sm text-[#64748B]">Recibió {info.receiverName}{info.deliveredAt ? ` · ${new Date(info.deliveredAt).toLocaleString("es-CO")}` : ""}</p>
          </section>
        ) : null}

        <section className="rounded-2xl bg-white p-5 shadow">
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Dirección</p>
          <p className="mt-1 text-lg font-black text-[#051C46]">{fullAddress || "Sin dirección"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {fullAddress && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#051C46] py-3 text-center text-sm font-bold text-white">Abrir en Maps</a>
            )}
            {info.contactPhone && (
              <a href={`tel:${info.contactPhone.replace(/[^\d+]/g, "")}`} className="rounded-xl border-2 border-[#051C46] py-3 text-center text-sm font-bold text-[#051C46]">Llamar {info.contactName?.split(" ")[0] ?? ""}</a>
            )}
          </div>
          {info.contactName && <p className="mt-2 text-sm text-[#64748B]">Recibe: {info.contactName}{info.contactPhone ? ` · ${info.contactPhone}` : ""}</p>}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow">
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Qué entregas</p>
          <p className="mt-1 text-lg font-black text-[#051C46]">{info.reference}</p>
          <p className="text-sm text-[#334155]">{info.quantity.toLocaleString("es-CO")} unidades{info.packages ? ` · ${info.packages} caja${info.packages > 1 ? "s" : ""}` : ""}</p>
          {info.description && <p className="text-xs text-[#64748B]">{info.description}</p>}
          {info.notes && <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-2 text-sm text-[#92400E]">{info.notes}</p>}
        </section>

        {!delivered && view === "info" && (
          <div className="space-y-2">
            <button onClick={() => { setView("deliver"); setSent(null); }} className="w-full rounded-2xl bg-[#16A34A] py-4 text-lg font-black text-white shadow-lg">Entregar pedido</button>
            <button onClick={() => { setView("incident"); setSent(null); }} className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-[#DC2626] shadow">Reportar novedad (no está, dirección mala…)</button>
          </div>
        )}

        {!delivered && view === "deliver" && (
          <section className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-black text-[#051C46]">Confirmar entrega</p>
              <button onClick={() => setView("info")} className="text-sm font-bold text-[#64748B]">Volver</button>
            </div>
            <DeliveryForm endpoint={`/api/entrega/${token}`} withLocation onDone={() => { setView("info"); load(); }} />
          </section>
        )}

        {!delivered && view === "incident" && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow">
            <p className="text-lg font-black text-[#051C46]">¿Qué pasó?</p>
            <div className="flex flex-wrap gap-2">
              {["No hay nadie para recibir", "Dirección incorrecta", "El cliente no recibe hoy", "Problema con el vehículo"].map((t) => (
                <button key={t} onClick={() => setIncident(t)} className={`rounded-full border px-3 py-1.5 text-sm ${incident === t ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0]"}`}>{t}</button>
              ))}
            </div>
            <textarea rows={3} value={incident} onChange={(e) => setIncident(e.target.value)} className="w-full rounded-xl border border-[#E2E8F0] p-3 text-base outline-none focus:border-[#051C46]" placeholder="Cuéntale a logística" />
            {error && <p className="text-sm font-semibold text-[#DC2626]">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setView("info")} className="flex-1 rounded-xl py-3 text-sm font-bold text-[#64748B]">Cancelar</button>
              <button disabled={!incident.trim()} onClick={sendIncident} className="flex-1 rounded-xl bg-[#DC2626] py-3 text-sm font-black text-white disabled:opacity-50">Enviar novedad</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
