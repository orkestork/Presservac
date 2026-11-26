import { requirePermission } from "@/lib/permissions";
import { getQuotationPayment } from "@/lib/finance";

/** Estado del pago de una cotización (comercial dueño, admin o financiera). */
export async function GET(_: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const access = await requirePermission("MODULE_COTIZACIONES", "view").then((a) => (a.ok ? a : requirePermission("MODULE_FINANZAS", "view")));
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { quotationId } = await params;
  const info = await getQuotationPayment(access.user, quotationId);
  if (!info) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json(info);
}
