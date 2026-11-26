import { requirePermission } from "@/lib/permissions";
import { designErrorResponse, uploadDesignVersion } from "@/lib/design";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("MODULE_DISENO", "edit");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Selecciona el archivo del arte" }, { status: 400 });
  const note = form?.get("note");
  try {
    const v = await uploadDesignVersion(access.user, id, file, typeof note === "string" ? note : null);
    broadcastPanelUpdate("design").catch(() => {});
    return Response.json({ id: v.id, version: v.version });
  } catch (e) {
    return designErrorResponse(e);
  }
}
