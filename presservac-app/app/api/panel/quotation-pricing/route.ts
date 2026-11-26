import { requireAdmin, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PRICING } from "@/lib/bag-pricing";
import { getPricingConfig, savePricingConfig } from "@/lib/quotation-pricing-store";

export async function GET() {
  const access = await requirePermission("MODULE_COTIZACIONES", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  return Response.json({ config: await getPricingConfig(), defaults: DEFAULT_PRICING });
}

export async function PUT(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return Response.json({ error: "Solo el administrador cambia las tarifas" }, { status: access.status });
  if (!prisma) return Response.json({ error: "DB no disponible" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const config = await savePricingConfig(body);
  return Response.json({ config });
}
