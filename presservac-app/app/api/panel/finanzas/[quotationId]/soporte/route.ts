import { requirePermission } from "@/lib/permissions";
import { attachPaymentProof, financeErrorResponse, getPaymentFile } from "@/lib/finance";
import { readDesignFile } from "@/lib/design-storage";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

async function anyAccess() {
  const a = await requirePermission("MODULE_COTIZACIONES", "view");
  return a.ok ? a : requirePermission("MODULE_FINANZAS", "view");
}

/** Ver el comprobante (el de comercial, o el de un pago con ?pago=id). */
export async function GET(request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const access = await anyAccess();
  if (!access.ok) return new Response("No autorizado", { status: access.status });
  const { quotationId } = await params;
  const f = await getPaymentFile(access.user, quotationId, new URL(request.url).searchParams.get("pago"));
  if (!f) return new Response("No encontrado", { status: 404 });
  const body = await readDesignFile(f.key);
  if (!body) return new Response("Archivo no disponible", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${f.name.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Comercial adjunta el comprobante que le envió el cliente. */
export async function POST(request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const access = await requirePermission("MODULE_COTIZACIONES", "view");
  if (!access.ok) return Response.json({ error: "No autorizado" }, { status: access.status });
  const { quotationId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Selecciona el comprobante" }, { status: 400 });
  try {
    await attachPaymentProof(access.user, quotationId, file);
    broadcastPanelUpdate("payments").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return financeErrorResponse(e);
  }
}
