import { deliverByToken, fulfillmentErrorResponse, getShipmentByToken } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export const runtime = "nodejs";

// Enlace del conductor: sin sesión, el token largo y aleatorio es la llave.

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await getShipmentByToken(token);
  if (!s) return Response.json({ error: "Enlace no válido" }, { status: 404 });
  return Response.json(s, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const s = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : undefined; };
  const sig = form.get("signature");
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File);
  try {
    await deliverByToken(token, {
      receiverName: s("receiverName"), receiverDoc: s("receiverDoc"), notes: s("notes"),
      lat: s("lat") ? Number(s("lat")) : null, lng: s("lng") ? Number(s("lng")) : null,
    }, sig instanceof File ? sig : null, photos);
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
