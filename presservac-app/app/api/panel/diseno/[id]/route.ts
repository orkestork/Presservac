import { requirePermission } from "@/lib/permissions";
import { getDesignRequest } from "@/lib/design";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_DISENO", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const detail = await getDesignRequest(access.user, id);
  if (!detail) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json(detail);
}
