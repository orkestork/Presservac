import { requirePermission } from "@/lib/permissions";
import { plantErrorResponse, runStepAction, type StepAction } from "@/lib/plant";
import { broadcastPanelUpdate } from "@/lib/realtime";

const ACTIONS: StepAction[] = ["start", "finish", "skip", "reopen"];

export async function POST(request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  const access = await requirePermission("MODULE_PLANTA", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { stepId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { action?: StepAction; responsible?: string; outputQty?: number | null; wasteKg?: number | null; notes?: string }
    | null;
  if (!body?.action || !ACTIONS.includes(body.action)) return Response.json({ error: "Acción inválida" }, { status: 400 });
  try {
    await runStepAction(access.user, stepId, body.action, body);
    broadcastPanelUpdate("plant").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return plantErrorResponse(e);
  }
}
