import { requirePermission } from "@/lib/permissions";
import { dispatchOrder, fulfillmentErrorResponse, type DispatchInput } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_LOGISTICA", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as DispatchInput | null;
  if (!body) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const o = await dispatchOrder(access.user, id, body);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ token: o?.shipment?.token ?? null });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
