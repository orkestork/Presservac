import { requirePermission } from "@/lib/permissions";
import { approveBalance, fulfillmentErrorResponse, type BalanceInput } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_FINANZAS", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const s = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : null; };
  const file = form.get("file");
  try {
    await approveBalance(access.user, id, {
      kind: (s("kind") ?? "") as BalanceInput["kind"], amount: Number(s("amount") ?? 0), method: s("method"),
      reference: s("reference"), paidAt: s("paidAt"), notes: s("notes"),
    }, file instanceof File ? file : null);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    broadcastPanelUpdate("payments").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
