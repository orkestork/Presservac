import { requirePermission } from "@/lib/permissions";
import { financeErrorResponse, listFinanceQueue } from "@/lib/finance";

export async function GET() {
  const access = await requirePermission("MODULE_FINANZAS", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  try {
    return Response.json(await listFinanceQueue(access.user));
  } catch (e) {
    return financeErrorResponse(e);
  }
}
