import { requireAnyView } from "@/lib/panel-access";
import { fulfillmentCaps, getFulfillmentOrder } from "@/lib/fulfillment";

/** Estado del despacho de una orden (pantalla de producción y de la cotización). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAnyView(["MODULE_PLANTA", "MODULE_LOGISTICA", "MODULE_FINANZAS", "MODULE_COTIZACIONES"]);
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const o = await getFulfillmentOrder(id, access.user);
  if (!o) return Response.json({ error: "No encontrado" }, { status: 404 });
  const caps = await fulfillmentCaps(access.user);
  const { shipment, ...rest } = o;
  // El enlace del conductor solo lo ve logística.
  return Response.json({ ...rest, shipment: shipment ? { ...shipment, token: caps.logistics ? shipment.token : null } : null, caps });
}
