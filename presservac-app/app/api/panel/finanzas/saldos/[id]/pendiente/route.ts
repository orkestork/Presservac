import { requirePermission } from "@/lib/permissions";
import { balancePending, fulfillmentErrorResponse } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_FINANZAS", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { note?: string } | null;
  try {
    await balancePending(access.user, id, body?.note ?? "");
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
