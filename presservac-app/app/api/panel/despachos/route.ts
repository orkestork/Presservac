import { requirePermission } from "@/lib/permissions";
import { listByStages } from "@/lib/fulfillment";

export async function GET() {
  const access = await requirePermission("MODULE_LOGISTICA", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const [coordinate, transit, done] = await Promise.all([
    listByStages(["LOGISTICS"]),
    listByStages(["IN_TRANSIT"]),
    listByStages(["DELIVERED", "CLOSED"], 40),
  ]);
  return Response.json({ coordinate, transit, done });
}
