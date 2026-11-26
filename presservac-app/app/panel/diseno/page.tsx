"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MdPictureAsPdf, MdImage, MdSearch } from "react-icons/md";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { DESIGN_STATUS, isImageMime } from "@/lib/design-status";

type Row = {
  id: string; number: number; reference: string; description: string; status: string;
  dueDate: string | null; updatedAt: string;
  quotation: { id: string; number: string; clientName: string; sellerName: string };
  designer: { id: string; fullName: string } | null;
  requestedBy: { id: string; fullName: string };
  latest: { id: string; version: number; mimeType: string } | null;
  myTurn: boolean;
};

const COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: "payment", title: "Esperando pago", statuses: ["AWAITING_PAYMENT"] },
  { key: "todo", title: "Por hacer", statuses: ["PENDING", "IN_PROGRESS"] },
  { key: "internal", title: "Revisión de diseño", statuses: ["INTERNAL_REVIEW"] },
  { key: "commercial", title: "Aprobación comercial", statuses: ["COMMERCIAL_REVIEW"] },
  { key: "done", title: "Aprobados", statuses: ["APPROVED"] },
];

function ago(iso: string, now: number) {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

function Card({ r, now }: { r: Row; now: number }) {
  const meta = DESIGN_STATUS[r.status];
  const late = r.dueDate && r.status !== "APPROVED" && new Date(r.dueDate).getTime() < now;
  return (
    <Link
      href={`/panel/diseno/${r.id}`}
      className={`block overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${r.myTurn ? "border-[#D60517] ring-2 ring-[#D60517]/10" : "border-[#E2E8F0]"}`}
    >
      <div className="flex h-28 items-center justify-center bg-[#F1F5F9]">
        {r.latest && isImageMime(r.latest.mimeType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/panel/diseno/archivo/${r.latest.id}`} alt="" className="h-full w-full object-contain" loading="lazy" />
        ) : r.latest ? (
          <span className="flex flex-col items-center text-[#D60517]"><MdPictureAsPdf size={34} /><span className="text-[10px] font-bold">PDF</span></span>
        ) : (
          <span className="flex flex-col items-center text-[#CBD5E1]"><MdImage size={30} /><span className="text-[10px] font-bold">Sin arte aún</span></span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black leading-tight text-[#051C46]">{r.reference}</p>
          {r.latest && <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">v{r.latest.version}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-[#64748B]">{r.quotation.clientName} · Cot. {r.quotation.number}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {r.myTurn && <span className="rounded-full bg-[#D60517] px-2 py-0.5 text-[10px] font-black uppercase text-white">Te toca</span>}
          {r.status === "IN_PROGRESS" || r.status === "PENDING" || r.status === "AWAITING_PAYMENT" ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
          ) : null}
          {late && <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">Atrasado</span>}
        </div>
        <p className="mt-2 text-[11px] text-[#94A3B8]">
          {r.designer ? r.designer.fullName : "Sin diseñador"} · {ago(r.updatedAt, now)}
          {r.dueDate && ` · para el ${new Date(r.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })}`}
        </p>
      </div>
    </Link>
  );
}

export default function DisenoPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const d = await fetch("/api/panel/diseno").then((r) => r.json()).catch(() => ({}));
    setRows(d.requests ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["design"], load);

  const mineCount = rows.filter((r) => r.myTurn).length;
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!onlyMine || r.myTurn) &&
      (!s || `${r.reference} ${r.quotation.clientName} ${r.quotation.number}`.toLowerCase().includes(s)));
  }, [rows, onlyMine, search]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Paso 3 del proceso</p>
          <h1 className="mt-1 text-2xl font-black text-[#051C46]">Diseño de artes</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">Comercial lo pide → financiera confirma el pago → diseño sube el arte → revisión de diseño → aprobación comercial.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MdSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Referencia, cliente o cotización" className="w-64 rounded-xl border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#051C46]" />
          </div>
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${onlyMine ? "border-[#D60517] bg-[#D60517] text-white" : "border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC]"}`}
          >
            Me toca {mineCount > 0 && <span className={`ml-1 rounded-full px-1.5 text-xs ${onlyMine ? "bg-white text-[#D60517]" : "bg-[#D60517] text-white"}`}>{mineCount}</span>}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white p-12 text-center">
          <p className="text-lg font-black text-[#051C46]">Todavía no hay artes</p>
          <p className="mt-1 text-sm text-[#64748B]">Se crean desde una cotización con el botón <b>«Pasar a diseño»</b>.</p>
          <Link href="/panel/cotizaciones" className="mt-4 inline-block rounded-xl bg-[#D60517] px-4 py-2 text-sm font-bold text-white">Ir a cotizaciones</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = visible.filter((r) => col.statuses.includes(r.status));
            return (
              <section key={col.key} className="rounded-2xl bg-[#F1F5F9] p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-black text-[#051C46]">{col.title}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#64748B]">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map((r) => <Card key={r.id} r={r} now={now} />)}
                  {items.length === 0 && <p className="py-6 text-center text-xs text-[#94A3B8]">Nada aquí</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
