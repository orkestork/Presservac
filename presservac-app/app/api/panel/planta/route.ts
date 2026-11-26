import { requirePermission } from "@/lib/permissions";
import { listPlantOrders } from "@/lib/plant";

export async function GET(request: Request) {
  const access = await requirePermission("MODULE_PLANTA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const quotationId = new URL(request.url).searchParams.get("cotizacion") ?? undefined;
  return Response.json(await listPlantOrders(access.user, { quotationId }));
}
