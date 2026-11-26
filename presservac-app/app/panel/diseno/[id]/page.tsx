"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MdCheck, MdCloudUpload, MdDownload, MdPictureAsPdf } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { DESIGN_EVENT_LABEL, DESIGN_STATUS, DESIGN_STEPS, isImageMime } from "@/lib/design-status";

type Version = { id: string; version: number; fileName: string; mimeType: string; size: number; note: string | null; uploadedBy: string; createdAt: string };
type Event = { id: string; type: string; comment: string | null; version: number | null; actor: string; createdAt: string };
type Detail = {
  id: string; number: number; reference: string; description: string; widthCm: number | null; lengthCm: number | null;
  brief: string | null; dueDate: string | null; status: string; approvedAt: string | null; createdAt: string;
  quotation: { id: string; number: string; clientName: string; clientContact: string | null; sellerName: string };
  designer: { id: string; fullName: string } | null;
  requestedBy: { id: string; fullName: string };
  versions: Version[]; events: Event[];
  caps: { canDesign: boolean; canApproveInternal: boolean; canApproveCommercial: boolean; canCancel: boolean };
  historyLimit: number;
  productionOptions: number[];
  plantOrder: { id: string; number: number; status: string } | null;
};

const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fileUrl = (v: Version) => `/api/panel/diseno/archivo/${v.id}`;

function Stepper({ status }: { status: string }) {
  const current = status === "APPROVED" ? 5 : status === "COMMERCIAL_REVIEW" ? 4 : status === "INTERNAL_REVIEW" ? 3 : status === "AWAITING_PAYMENT" ? 1 : 2;
  return (
    <ol className="flex items-center">
      {DESIGN_STEPS.map((s, i) => {
        const done = i < current || status === "APPROVED";
        const active = i === current && status !== "APPROVED";
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center text-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${done ? "bg-[#16A34A] text-white" : active ? "bg-[#D60517] text-white ring-4 ring-[#D60517]/15" : "bg-[#E2E8F0] text-[#94A3B8]"}`}>
                {done ? <MdCheck /> : i + 1}
              </span>
              <span className={`mt-1 w-20 text-[10px] font-bold leading-tight ${active ? "text-[#D60517]" : done ? "text-[#15803D]" : "text-[#94A3B8]"}`}>{s}</span>
            </div>
            {i < DESIGN_STEPS.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 ${i < current ? "bg-[#16A34A]" : "bg-[#E2E8F0]"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Viewer({ v }: { v: Version | null }) {
  if (!v) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] text-center text-[#94A3B8]">
        <MdCloudUpload size={42} />
        <p className="mt-2 text-sm font-bold">Aún no hay arte</p>
        <p className="text-xs">Cuando diseño lo suba, se ve aquí.</p>
      </div>
    );
  }
  return isImageMime(v.mimeType) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileUrl(v)} alt={v.fileName} className="h-[560px] w-full rounded-2xl border border-[#E2E8F0] bg-[repeating-conic-gradient(#F1F5F9_0%_25%,#fff_0%_50%)] bg-[length:20px_20px] object-contain" />
  ) : (
    <iframe src={fileUrl(v)} title={v.fileName} className="h-[640px] w-full rounded-2xl border border-[#E2E8F0] bg-white" />
  );
}

export default function DesignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [changes, setChanges] = useState<"internal" | "commercial" | null>(null);
  const [comment, setComment] = useState("");
  const [drag, setDrag] = useState(false);
  const [qty, setQty] = useState("");
  const [due, setDue] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/panel/diseno/${id}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) { setError(j?.error ?? "No se pudo cargar"); return; }
    setD(j);
    setSelected((s) => (s && j.versions.some((v: Version) => v.id === s) ? s : j.versions[0]?.id ?? null));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const { markLocalWrite } = useRealtimeRefresh(["design"], load);

  const act = async (action: string, extra?: { comment?: string; quantity?: number; dueDate?: string | null }) => {
    setBusy(true); setError(null);
    try {
      markLocalWrite();
      const r = await fetch(`/api/panel/diseno/${id}/accion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "No se pudo completar"); return; }
      setChanges(null); setComment("");
      await load();
    } finally { setBusy(false); }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      markLocalWrite();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("note", note);
      const r = await fetch(`/api/panel/diseno/${id}/version`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "No se pudo subir"); return; }
      setFile(null); setNote(""); setSelected(j.id);
      await load();
    } finally { setBusy(false); }
  };

  if (!d) {
    return <div className="flex h-64 items-center justify-center">{error ? <p className="text-sm font-semibold text-[#DC2626]">{error}</p> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" />}</div>;
  }

  const meta = DESIGN_STATUS[d.status];
  const current = d.versions[0] ?? null;
  const shown = d.versions.find((v) => v.id === selected) ?? current;
  const lastChange = d.events.find((e) => e.type === "INTERNAL_CHANGES" || e.type === "COMMERCIAL_CHANGES");
  const lastUpload = d.events.find((e) => e.type === "UPLOADED");
  const pendingChanges = d.status === "IN_PROGRESS" && lastChange && (!lastUpload || new Date(lastChange.createdAt) > new Date(lastUpload.createdAt)) ? lastChange : null;
  const canUpload = d.caps.canDesign && (d.status === "PENDING" || d.status === "IN_PROGRESS");

  const ChangesBox = ({ kind }: { kind: "internal" | "commercial" }) => (
    <div className="mt-3 space-y-2">
      <textarea autoFocus rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Qué hay que cambiar? Ej. el logo más grande, cambiar el verde por el Pantone 355…" className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm outline-none focus:border-[#051C46]" />
      <div className="flex gap-2">
        <button onClick={() => { setChanges(null); setComment(""); }} className="rounded-xl px-3 py-2 text-sm font-bold text-[#64748B]">Cancelar</button>
        <button disabled={busy || !comment.trim()} onClick={() => act(kind === "internal" ? "internal_changes" : "commercial_changes", { comment })} className="flex-1 rounded-xl bg-[#051C46] py-2 text-sm font-bold text-white disabled:opacity-50">
          Devolver a diseño con estos cambios
        </button>
      </div>
    </div>
  );

  let actionBox: React.ReactNode;
  if (d.status === "APPROVED") {
    actionBox = (
      <div className="rounded-2xl border-2 border-[#16A34A] bg-[#F0FDF4] p-5">
        <p className="text-lg font-black text-[#15803D]">✓ Arte aprobado</p>
        <p className="text-sm text-[#166534]">Versión {current?.version} · {d.approvedAt && when(d.approvedAt)}. Lista para producción.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {current && <a href={`${fileUrl(current)}?descargar`} className="inline-flex items-center gap-1 rounded-xl bg-[#16A34A] px-4 py-2 text-sm font-bold text-white"><MdDownload /> Descargar arte final</a>}
          {d.plantOrder && (
            <Link href={`/panel/planta/${d.plantOrder.id}`} className="inline-flex items-center rounded-xl border border-[#16A34A] px-4 py-2 text-sm font-bold text-[#15803D] hover:bg-white">
              Ver en producción · OP-{d.plantOrder.number} →
            </Link>
          )}
        </div>
      </div>
    );
  } else if (d.status === "CANCELLED") {
    actionBox = <div className="rounded-2xl bg-[#F1F5F9] p-5 text-sm font-bold text-[#64748B]">Solicitud cancelada.</div>;
  } else if (canUpload) {
    actionBox = (
      <div className="rounded-2xl border-2 border-[#D60517] bg-white p-5">
        <p className="text-base font-black text-[#051C46]">{current ? "Sube la versión corregida" : "Sube el arte"}</p>
        {pendingChanges && (
          <div className="mt-2 rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
            <b>Cambios pedidos por {pendingChanges.actor}:</b> {pendingChanges.comment}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          onClick={() => fileInput.current?.click()}
          className={`mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-6 text-center transition ${drag ? "border-[#D60517] bg-[#FDEEEF]" : "border-[#CBD5E1] hover:border-[#051C46]"}`}
        >
          <MdCloudUpload size={30} className="text-[#64748B]" />
          {file ? <p className="mt-1 text-sm font-bold text-[#051C46]">{file.name}</p> : <p className="mt-1 text-sm text-[#64748B]">Arrastra el archivo o haz clic · PDF, AI (compatible PDF), PNG o JPG</p>}
          <input ref={fileInput} type="file" accept=".pdf,.ai,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Qué cambiaste? (opcional)" className="mt-2 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#051C46]" />
        <button disabled={!file || busy} onClick={upload} className="mt-3 w-full rounded-xl bg-[#D60517] py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? "Subiendo…" : "Subir y enviar a revisión de diseño"}
        </button>
        {d.status === "PENDING" && !d.designer && (
          <button disabled={busy} onClick={() => act("take")} className="mt-2 w-full text-xs font-bold text-[#64748B] hover:text-[#051C46]">Solo avisar que lo estoy haciendo</button>
        )}
      </div>
    );
  } else if (d.status === "INTERNAL_REVIEW" && d.caps.canApproveInternal) {
    actionBox = (
      <div className="rounded-2xl border-2 border-[#D60517] bg-white p-5">
        <p className="text-base font-black text-[#051C46]">Revisión de diseño · v{current?.version}</p>
        <p className="text-sm text-[#64748B]">Revisa medidas, textos, colores y logos antes de que lo vea comercial.</p>
        {changes === "internal" ? <ChangesBox kind="internal" /> : (
          <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={() => setChanges("internal")} className="flex-1 rounded-xl border border-[#E2E8F0] py-2.5 text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]">Pedir cambios</button>
            <button disabled={busy} onClick={() => act("internal_approve")} className="flex-1 rounded-xl bg-[#16A34A] py-2.5 text-sm font-black text-white hover:bg-[#15803D]">Aprobar y pasar a comercial</button>
          </div>
        )}
      </div>
    );
  } else if (d.status === "COMMERCIAL_REVIEW" && d.caps.canApproveCommercial) {
    actionBox = (
      <div className="rounded-2xl border-2 border-[#D60517] bg-white p-5">
        <p className="text-base font-black text-[#051C46]">Aprobación final · v{current?.version}</p>
        <p className="text-sm text-[#64748B]">Diseño ya lo revisó. Confírmalo con lo que pidió el cliente; al aprobar pasa a producción.</p>
        {changes === "commercial" ? <ChangesBox kind="commercial" /> : (
          <>
            <div className="mt-3 rounded-xl bg-[#F8FAFC] p-3">
              <p className="text-xs font-bold text-[#334155]">¿Cuántas unidades se van a producir?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.productionOptions.map((n) => (
                  <button key={n} type="button" onClick={() => setQty(String(n))} className={`rounded-full border px-3 py-1 text-xs font-bold ${qty === String(n) ? "border-[#051C46] bg-[#051C46] text-white" : "border-[#E2E8F0] bg-white text-[#334155]"}`}>
                    {n.toLocaleString("es-CO")} und
                  </button>
                ))}
                <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="Otra" className="w-24 rounded-full border border-[#E2E8F0] px-3 py-1 text-xs outline-none focus:border-[#051C46]" />
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-[#64748B]">
                Entrega al cliente
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs" />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={() => setChanges("commercial")} className="flex-1 rounded-xl border border-[#E2E8F0] py-2.5 text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]">Pedir cambios</button>
              <button
                disabled={busy || !(Number(qty) > 0)}
                onClick={() => act("commercial_approve", { quantity: Number(qty), dueDate: due || null })}
                className="flex-1 rounded-xl bg-[#16A34A] py-2.5 text-sm font-black text-white hover:bg-[#15803D] disabled:opacity-50"
              >
                Aprobar y enviar a producción
              </button>
            </div>
          </>
        )}
      </div>
    );
  } else {
    const waiting =
      d.status === "AWAITING_PAYMENT" ? "que financiera confirme el pago del cliente; después se puede empezar el arte" :
      d.status === "INTERNAL_REVIEW" ? "la revisión de diseño" :
      d.status === "COMMERCIAL_REVIEW" ? `la aprobación de ${d.requestedBy.fullName}` :
      d.designer ? `que ${d.designer.fullName} suba el arte` : "que diseño tome el arte";
    actionBox = (
      <div className="rounded-2xl bg-[#F8FAFC] p-5">
        <p className="text-sm font-bold text-[#334155]">Esperando {waiting}.</p>
        {pendingChanges && <p className="mt-2 text-xs text-[#92400E]"><b>Últimos cambios pedidos:</b> {pendingChanges.comment}</p>}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/panel/diseno" className="text-xs font-bold text-[#94A3B8] hover:text-[#1A1A1A]">← Diseño</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-[#051C46]">{d.reference}</h1>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-[#64748B]">
            {d.quotation.clientName} · <Link href={`/panel/cotizaciones/${d.quotation.id}`} className="font-bold text-[#051C46] hover:underline">Cotización {d.quotation.number}</Link> · Arte #{d.number}
          </p>
        </div>
        <div className="w-full max-w-xl"><Stepper status={d.status} /></div>
      </div>

      {error && <div className="mb-4 flex justify-between rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#DC2626]"><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <Viewer v={shown} />
          {d.versions.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Historial · actual y {d.historyLimit} anteriores</p>
                {shown && <a href={`${fileUrl(shown)}?descargar`} className="flex items-center gap-1 text-xs font-bold text-[#051C46] hover:underline"><MdDownload /> Descargar v{shown.version}</a>}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {d.versions.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setSelected(v.id)}
                    className={`w-36 shrink-0 overflow-hidden rounded-xl border-2 bg-white text-left transition ${shown?.id === v.id ? "border-[#D60517]" : "border-[#E2E8F0] hover:border-[#94A3B8]"}`}
                  >
                    <div className="flex h-20 items-center justify-center bg-[#F1F5F9]">
                      {isImageMime(v.mimeType)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={fileUrl(v)} alt="" className="h-full w-full object-contain" loading="lazy" />
                        : <MdPictureAsPdf size={28} className="text-[#D60517]" />}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-black text-[#051C46]">v{v.version} {i === 0 && <span className="ml-1 rounded bg-[#051C46] px-1 text-[9px] text-white">ACTUAL</span>}</p>
                      <p className="truncate text-[10px] text-[#64748B]">{v.note || v.fileName}</p>
                      <p className="text-[10px] text-[#94A3B8]">{when(v.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {actionBox}

          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 text-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Lo que pidió comercial</p>
            {d.description && <p className="font-semibold text-[#1A1A1A]">{d.description}</p>}
            {d.brief ? <p className="mt-1 whitespace-pre-line text-[#334155]">{d.brief}</p> : <p className="mt-1 text-[#94A3B8]">Sin instrucciones adicionales.</p>}
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-[#94A3B8]">Pidió</dt><dd className="text-[#334155]">{d.requestedBy.fullName}</dd>
              <dt className="text-[#94A3B8]">Diseñador</dt><dd className="text-[#334155]">{d.designer?.fullName ?? "—"}</dd>
              <dt className="text-[#94A3B8]">Contacto cliente</dt><dd className="text-[#334155]">{d.quotation.clientContact || "—"}</dd>
              {d.dueDate && <><dt className="text-[#94A3B8]">Para el</dt><dd className="font-bold text-[#334155]">{new Date(d.dueDate).toLocaleDateString("es-CO", { timeZone: "UTC" })}</dd></>}
            </dl>
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Movimientos</p>
            <ol className="space-y-3">
              {d.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.type.endsWith("CHANGES") ? "bg-[#F59E0B]" : e.type.endsWith("APPROVED") ? "bg-[#16A34A]" : "bg-[#94A3B8]"}`} />
                  <div>
                    <p className="text-[#334155]"><b>{e.actor}</b> {DESIGN_EVENT_LABEL[e.type] ?? e.type}{e.version ? ` (v${e.version})` : ""}</p>
                    {e.comment && <p className="mt-0.5 rounded-lg bg-[#F8FAFC] px-2 py-1 text-xs text-[#475569]">“{e.comment}”</p>}
                    <p className="text-[11px] text-[#94A3B8]">{when(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {d.caps.canCancel && d.status !== "APPROVED" && d.status !== "CANCELLED" && (
            <button onClick={() => act("cancel")} disabled={busy} className="w-full text-xs font-bold text-[#94A3B8] hover:text-[#DC2626]">Cancelar esta solicitud de arte</button>
          )}
        </aside>
      </div>
    </div>
  );
}
