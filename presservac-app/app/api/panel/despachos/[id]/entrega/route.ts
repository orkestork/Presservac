import { requirePermission } from "@/lib/permissions";
import { deliverByStaff, fulfillmentErrorResponse } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

/** Logística registra la entrega (transportadora o cliente recoge). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_LOGISTICA", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const s = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : undefined; };
  const sig = form.get("signature");
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File);
  try {
    await deliverByStaff(access.user, id, { receiverName: s("receiverName"), receiverDoc: s("receiverDoc"), notes: s("notes") }, sig instanceof File ? sig : null, photos);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
