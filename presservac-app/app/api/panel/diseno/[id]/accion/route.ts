import { requirePermission } from "@/lib/permissions";
import { designErrorResponse, runDesignAction, type DesignAction } from "@/lib/design";
import { broadcastPanelUpdate } from "@/lib/realtime";

const ACTIONS: DesignAction[] = ["take", "internal_approve", "internal_changes", "commercial_approve", "commercial_changes", "cancel"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_DISENO", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: DesignAction; comment?: string; quantity?: number; dueDate?: string | null } | null;
  if (!body?.action || !ACTIONS.includes(body.action)) return Response.json({ error: "Acción inválida" }, { status: 400 });
  try {
    await runDesignAction(access.user, id, body.action, body.comment, { quantity: body.quantity, dueDate: body.dueDate });
    broadcastPanelUpdate("design").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return designErrorResponse(e);
  }
}
