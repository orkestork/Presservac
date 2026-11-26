import { requirePermission } from "@/lib/permissions";
import { createDesignRequests, designErrorResponse, listDesignRequests, type CreateDesignInput } from "@/lib/design";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function GET(request: Request) {
  const access = await requirePermission("MODULE_DISENO", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const quotationId = new URL(request.url).searchParams.get("cotizacion") ?? undefined;
  return Response.json({ requests: await listDesignRequests(access.user, { quotationId }) });
}

/** Comercial pasa referencias de una cotización a diseño. */
export async function POST(request: Request) {
  const access = await requirePermission("MODULE_DISENO", "create");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const body = (await request.json().catch(() => null)) as CreateDesignInput | null;
  if (!body?.quotationId) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const created = await createDesignRequests(access.user, body);
    broadcastPanelUpdate("design").catch(() => {});
    return Response.json({ ids: created.map((c) => c.id) });
  } catch (e) {
    return designErrorResponse(e);
  }
}
