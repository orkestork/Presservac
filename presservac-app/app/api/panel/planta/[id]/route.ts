import { requirePermission } from "@/lib/permissions";
import { cancelPlantOrder, getPlantOrder, plantErrorResponse } from "@/lib/plant";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_PLANTA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const o = await getPlantOrder(access.user, id);
  if (!o) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json(o);
}

/** Cancelar la orden (jefe de producción / admin). */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_PLANTA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  try {
    await cancelPlantOrder(access.user, id);
    broadcastPanelUpdate("plant").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return plantErrorResponse(e);
  }
}
