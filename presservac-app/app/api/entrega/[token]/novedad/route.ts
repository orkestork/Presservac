import { fulfillmentErrorResponse, reportIncidentByToken } from "@/lib/fulfillment";
import { broadcastPanelUpdate } from "@/lib/realtime";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  try {
    await reportIncidentByToken(token, body?.text ?? "");
    broadcastPanelUpdate("fulfillment").catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return fulfillmentErrorResponse(e);
  }
}
