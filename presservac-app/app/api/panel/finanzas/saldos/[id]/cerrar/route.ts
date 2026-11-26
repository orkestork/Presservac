import { requirePermission } from "@/lib/permissions";
import { closeOrder, fulfillmentErrorResponse } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_FINANZAS", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  try {
    await closeOrder(access.user, id);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
