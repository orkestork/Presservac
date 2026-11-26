import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saveQuotationFull, type QuotationFullInput } from "@/lib/panel";
import { createNotification } from "@/lib/notifications";
import { broadcastPanelUpdate } from "@/lib/realtime";

function errorResponse(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  if (m === "CLIENT_REQUIRED") return Response.json({ error: "Escribe el nombre del cliente" }, { status: 400 });
  if (m === "CLIENT_NOT_FOUND") return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  if (m === "NOT_EDITABLE") return Response.json({ error: "Solo se puede editar en borrador" }, { status: 409 });
  if (m === "NOT_FOUND") return Response.json({ error: "Cotización no encontrada" }, { status: 404 });
  return Response.json({ error: "Error interno" }, { status: 500 });
}

/** Crea (sin id) o reemplaza (con id) una cotización completa en un solo paso. */
export async function POST(request: Request) {
  const access = await requirePermission("MODULE_COTIZACIONES", "create");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { session } = access;
  if (!prisma) return Response.json({ error: "DB no disponible" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as (QuotationFullInput & { id?: string }) | null;
  if (!body) return Response.json({ error: "Datos inválidos" }, { status: 400 });

  if (body.id) {
    const q = await prisma.quotation.findUnique({ where: { id: body.id }, select: { sellerId: true } });
    if (!q) return Response.json({ error: "Cotización no encontrada" }, { status: 404 });
    if (session.role !== "ADMIN" && q.sellerId !== session.userId) return Response.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const saved = await saveQuotationFull(session.userId, body.id ?? null, body);
    if (!body.id) {
      createNotification({
        eventKey: "quotation.new",
        title: "Nueva cotización creada",
        detail: `Cotización ${saved.number} · ${saved.clientName}`,
        href: `/panel/cotizaciones/${saved.id}`,
        createdById: session.userId,
        metadata: { quotationId: saved.id },
      }).catch(() => {});
    }
    broadcastPanelUpdate("quotations").catch(() => {});
    return Response.json({ id: saved.id, number: saved.number });
  } catch (e) {
    return errorResponse(e);
  }
}
