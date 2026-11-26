import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createQuotation, getQuotations, type QuotationClientInput } from "@/lib/panel";
import { createNotification } from "@/lib/notifications";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function GET() {
  const access = await requirePermission("MODULE_COTIZACIONES", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { session } = access;
  if (!prisma) return Response.json({ quotations: [] });

  const quotations = await getQuotations(session);
  return Response.json({ quotations });
}

export async function POST(request: Request) {
  const access = await requirePermission("MODULE_COTIZACIONES", "create");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { session } = access;
  if (!prisma) return Response.json({ error: "DB no disponible" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as QuotationClientInput;

  let created;
  try {
    created = await createQuotation(session.userId, body);
  } catch (e) {
    if (e instanceof Error && e.message === "CLIENT_REQUIRED") return Response.json({ error: "Escribe el nombre del cliente o elige uno registrado" }, { status: 400 });
    if (e instanceof Error && e.message === "CLIENT_NOT_FOUND") return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    return Response.json({ error: "Error interno" }, { status: 500 });
  }

  createNotification({
    eventKey: "quotation.new",
    title: "Nueva cotización creada",
    detail: `Cotización ${created.number} · ${created.clientName}`,
    href: "/panel/cotizaciones",
    createdById: session.userId,
    metadata: { quotationId: created.id, clientId: created.clientId },
  }).catch(() => {});

  broadcastPanelUpdate("quotations").catch(() => {});

  return Response.json(created);
}
