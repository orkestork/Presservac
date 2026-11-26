import { MAIN_WHATSAPP as PRESSERVAC_WHATSAPP_NUMBER } from "@/lib/site";

export function buildWhatsAppProductUrl(input: {
  nombre: string;
  sku?: string;
  oemReferencia?: string;
  precio?: string;
  url?: string;
}) {
  const message = [
    `Hola Presservac, quiero cotizar este repuesto: ${input.nombre}.`,
    input.sku ? `SKU: ${input.sku}.` : null,
    input.oemReferencia ? `OEM/Referencia: ${input.oemReferencia}.` : null,
    input.precio ? `Precio publicado: ${input.precio}.` : null,
    input.url ? `Producto: ${input.url}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `https://wa.me/${PRESSERVAC_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
