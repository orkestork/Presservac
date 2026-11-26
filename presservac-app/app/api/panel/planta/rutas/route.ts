import { requirePermission } from "@/lib/permissions";
import { getRoutes, plantErrorResponse, saveRoute } from "@/lib/plant";

export async function GET() {
  const access = await requirePermission("MODULE_PLANTA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  return Response.json({ routes: await getRoutes() });
}

/** Editar las fases de una ruta (jefe de producción). Aplica a las órdenes nuevas. */
export async function PUT(request: Request) {
  const access = await requirePermission("MODULE_PLANTA", "create");
  if (!access.ok) return Response.json({ error: "Solo el jefe de producción puede cambiar las fases" }, { status: access.status });
  const body = (await request.json().catch(() => null)) as { id?: string; name?: string; phases?: unknown } | null;
  if (!body?.id) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    await saveRoute(body.id, body);
    return Response.json({ routes: await getRoutes() });
  } catch (e) {
    return plantErrorResponse(e);
  }
}
