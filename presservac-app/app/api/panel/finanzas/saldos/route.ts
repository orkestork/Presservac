import { requirePermission } from "@/lib/permissions";
import { listByStages } from "@/lib/fulfillment";

export async function GET() {
  const access = await requirePermission("MODULE_FINANZAS", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const [balance, toClose, closed] = await Promise.all([
    listByStages(["BALANCE_CHECK"]),
    listByStages(["DELIVERED"]),
    listByStages(["CLOSED"], 40),
  ]);
  return Response.json({ balance, toClose, closed });
}
