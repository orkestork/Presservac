import { requirePermission } from "@/lib/permissions";
import { fulfillmentErrorResponse, releaseOrder } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

/** Operación libera la orden terminada: pasa a financiera para verificar el saldo. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_PLANTA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  try {
    await releaseOrder(access.user, id);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
