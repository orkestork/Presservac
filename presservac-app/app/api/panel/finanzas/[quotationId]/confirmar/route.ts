import { requirePermission } from "@/lib/permissions";
import { confirmPayment, financeErrorResponse } from "@/lib/finance";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const access = await requirePermission("MODULE_FINANZAS", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { quotationId } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : null; };
  const file = form.get("file");
  try {
    const r = await confirmPayment(access.user, quotationId, {
      kind: str("kind") ?? "", amount: Number(str("amount") ?? 0), method: str("method"), reference: str("reference"),
      paidAt: str("paidAt"), notes: str("notes"),
    }, file instanceof File ? file : null);
    broadcastPanelUpdate("payments").catch(() => {});
    broadcastPanelUpdate("design").catch(() => {});
    return Response.json(r);
  } catch (e) {
    return financeErrorResponse(e);
  }
}
