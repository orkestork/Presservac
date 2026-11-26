import { requirePermission } from "@/lib/permissions";
import { getDesignFileForUser } from "@/lib/design";
import { readDesignFile } from "@/lib/design-storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const access = await requirePermission("MODULE_DISENO", "view");
  if (!access.ok) return new Response("No autorizado", { status: access.status });
  const { versionId } = await params;
  const v = await getDesignFileForUser(access.user, versionId);
  if (!v) return new Response("No encontrado", { status: 404 });
  const body = await readDesignFile(v.fileKey);
  if (!body) return new Response("Archivo no disponible", { status: 404 });
  const download = new URL(request.url).searchParams.has("descargar");
  const safeName = v.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": v.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
