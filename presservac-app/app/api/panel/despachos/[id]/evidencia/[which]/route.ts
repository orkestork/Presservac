import { requireAnyView } from "@/lib/panel-access";
import { getEvidenceKey } from "@/lib/fulfillment";
import { readDesignFile } from "@/lib/design-storage";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; which: string }> }) {
  const access = await requireAnyView(["MODULE_LOGISTICA", "MODULE_FINANZAS", "MODULE_PLANTA", "MODULE_COTIZACIONES"]);
  if (!access.ok) return new Response("No autorizado", { status: access.status });
  const { id, which } = await params;
  const key = await getEvidenceKey(access.user, id, which);
  if (!key) return new Response("No encontrado", { status: 404 });
  const body = await readDesignFile(key);
  if (!body) return new Response("Archivo no disponible", { status: 404 });
  const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : key.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
  return new Response(new Uint8Array(body), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
