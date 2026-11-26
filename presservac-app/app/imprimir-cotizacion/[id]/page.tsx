import { notFound, redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuotationWithItems } from "@/lib/panel";
import { fmtDateOnly } from "@/lib/date";
import { calcLineTotal } from "@/lib/quotation-calculator";
import { BAG_TYPE_LABEL, DELIVERY_OPTIONS, PRINT_CLAUSE, QUANTITY_TOLERANCE, STRUCTURE_LABEL } from "@/lib/quotation-terms";

const fmt = (n: number) =>
  (n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const num = (n: number | null) => (n == null ? "" : n.toLocaleString("es-CO", { maximumFractionDigits: 1 }));

export default async function QuotationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session || session.role === "CUSTOMER") redirect("/login");

  const { id } = await params;
  if (!prisma) notFound();

  const owner = await prisma.quotation.findUnique({ where: { id }, select: { sellerId: true } });
  if (!owner) notFound();
  if (session.role !== "ADMIN" && owner.sellerId !== session.userId) notFound();

  const q = await getQuotationWithItems(id);
  if (!q) notFound();
  const { summary, taxConfig } = q;
  const ivaPct = taxConfig.ivaPct;
  const groups = Array.from(new Set(DELIVERY_OPTIONS.map((o) => o.group)));

  const info = (label: string, value: string | null | undefined) => (
    <div className="flex border-b border-[#CCCCCC] py-1">
      <span className="w-28 shrink-0 text-[10px] font-black uppercase tracking-wider text-[#051C46]">{label}</span>
      <span className="text-xs">{value || "—"}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1000px] bg-white p-8 text-[#1A1A1A] print:max-w-none print:p-0">
      {q.status === "DRAFT" && (
        <p className="mb-4 rounded-lg bg-[#FEF3C7] px-3 py-2 text-center text-xs font-bold text-[#92400E] print:hidden">
          Borrador: vista previa, aún no se ha enviado al cliente.
        </p>
      )}

      <header className="flex items-center justify-between border-b-4 border-[#051C46] pb-4">
        <img src="/logo.png" alt="Presservac" className="h-14 w-auto object-contain" />
        <div className="text-right">
          <h1 className="text-2xl font-black tracking-wide text-[#051C46]">COTIZACIÓN</h1>
          <p className="text-sm font-black text-[#D60517]">CONSECUTIVO No. {q.number}</p>
          <p className="text-xs text-[#64748B]">Fecha de emisión: {new Date(q.createdAt).toLocaleDateString("es-CO")}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-3 gap-x-6">
        <div>
          {info("Cliente", q.clientName)}
          {info("Dirección", q.clientAddress)}
          {info("Correo", q.clientEmail)}
        </div>
        <div>
          {info("NIT - C.C.", q.clientNit)}
          {info("Ciudad", q.clientCity)}
        </div>
        <div>
          {info("Contacto", q.clientContact)}
          {info("Teléfono", q.clientPhone)}
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#051C46] text-white">
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-left">#</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-left">Concepto</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-left">Referencia</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-left">Estructura</th>
            <th colSpan={2} className="border border-[#051C46] px-1.5 py-1 text-center">Medidas cm</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1">Micras</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-right">Cantidad</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1">U/M</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-right">Valor unitario</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-right">IVA</th>
            <th rowSpan={2} className="border border-[#051C46] px-1.5 py-1 text-right">Total</th>
          </tr>
          <tr className="bg-[#051C46] text-white">
            <th className="border border-[#051C46] px-1.5 py-1">Ancho</th>
            <th className="border border-[#051C46] px-1.5 py-1">Largo</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, idx) => {
            const line = calcLineTotal(it);
            const iva = line * (ivaPct / 100);
            const extras = [
              it.bagType && it.bagType !== "COJIN" ? BAG_TYPE_LABEL[it.bagType] + (it.gussetCm ? ` fuelle ${num(it.gussetCm)} cm` : "") : null,
              it.zipper ? "Zipper" : null,
              it.valve ? "Válvula" : null,
            ].filter(Boolean).join(" · ");
            return (
              <tr key={it.id} style={{ breakInside: "avoid" }}>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-center">{idx + 1}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1">
                  {it.name}
                  {extras && <div className="text-[10px] text-[#64748B]">{extras}</div>}
                </td>
                <td className="border border-[#CCCCCC] px-1.5 py-1">{it.reference}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1">{it.structure ? STRUCTURE_LABEL[it.structure] ?? it.structure : ""}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-center">{num(it.widthCm)}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-center">{num(it.lengthCm)}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-center">{it.microns ?? ""}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-right">{it.quantity.toLocaleString("es-CO")}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-center">{it.unit}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-right">{fmt(it.unitPrice)}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-right">{fmt(iva)}</td>
                <td className="border border-[#CCCCCC] px-1.5 py-1 text-right font-bold">{fmt(line + iva)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end" style={{ breakInside: "avoid" }}>
        <div className="w-72 space-y-0.5 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{fmt(summary.subtotal)}</span></div>
          {taxConfig.reteIcaPct > 0 && <div className="flex justify-between"><span>ReteICA ({taxConfig.reteIcaPct}%)</span><span>-{fmt(summary.reteIca)}</span></div>}
          {taxConfig.reteFuentePct > 0 && <div className="flex justify-between"><span>ReteFuente ({taxConfig.reteFuentePct}%)</span><span>-{fmt(summary.reteFuente)}</span></div>}
          <div className="flex justify-between"><span>IVA ({ivaPct}%)</span><span>{fmt(summary.iva)}</span></div>
          <div className="flex justify-between border-t-2 border-[#051C46] pt-1 text-sm font-black text-[#051C46]">
            <span>TOTAL</span><span>{fmt(summary.total)}</span>
          </div>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-[3fr_2fr] gap-6 text-[11px]" style={{ breakInside: "avoid" }}>
        <div>
          <h2 className="mb-1 bg-[#051C46] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">Tiempos de entrega</h2>
          <table className="w-full border-collapse">
            <tbody>
              {groups.map((g) =>
                DELIVERY_OPTIONS.filter((o) => o.group === g).map((o, i, arr) => (
                  <tr key={o.key}>
                    {i === 0 && <td rowSpan={arr.length} className="w-36 border border-[#CCCCCC] px-1.5 py-1 font-bold uppercase">{g}</td>}
                    <td className="w-28 border border-[#CCCCCC] px-1.5 py-1 uppercase">{o.label}</td>
                    <td className="border border-[#CCCCCC] px-1.5 py-1 uppercase">{o.time}</td>
                    <td className="w-6 border border-[#CCCCCC] text-center font-black text-[#D60517]">{q.deliveryKeys.includes(o.key) ? "X" : ""}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="mb-1 bg-[#051C46] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">Condiciones comerciales</h2>
          <div className="space-y-1 border border-[#CCCCCC] p-2">
            <p><b>VALIDEZ DE LA OFERTA:</b> {q.validUntil ? `hasta el ${fmtDateOnly(q.validUntil)}` : "30 días"}</p>
            <p><b>FORMA DE PAGO:</b> {q.paymentTerms || "—"}</p>
            <p className="uppercase"><b>{QUANTITY_TOLERANCE}</b></p>
            {q.printClause && <p className="uppercase">{PRINT_CLAUSE}</p>}
          </div>
        </div>
      </section>

      <section className="mt-4 text-[11px]" style={{ breakInside: "avoid" }}>
        <p><b className="text-[#051C46]">OBSERVACIONES:</b> {q.notes || ""}</p>
        <p className="mt-2"><b className="text-[#051C46]">ELABORADO POR:</b> {q.seller.fullName}</p>
      </section>

      <footer className="mt-6 border-t border-[#CCCCCC] pt-2 text-[9px] text-[#94A3B8]">
        Valores en pesos colombianos. Cotización generada en la plataforma Presservac.
      </footer>
    </div>
  );
}
