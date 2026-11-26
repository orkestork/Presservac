import { requirePermission } from "@/lib/permissions";
import { financeErrorResponse, markPaymentPending } from "@/lib/finance";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function POST(request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const access = await requirePermission("MODULE_FINANZAS", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { quotationId } = await params;
  const body = (await request.json().catch(() => null)) as { note?: string } | null;
  try {
    await markPaymentPending(access.user, quotationId, body?.note ?? "");
    broadcastPanelUpdate("payments").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return financeErrorResponse(e);
  }
}
