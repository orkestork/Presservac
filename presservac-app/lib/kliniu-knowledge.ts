/**
 * Base de conocimiento comercial de Presservac, compartida por el chat web
 * (app/api/chat/route.ts) y el asistente de WhatsApp (lib/wati-ai.ts).
 *
 * Solo datos públicos de Presservac. Completar aquí fichas técnicas, tiempos
 * y políticas comerciales cuando Presservac las defina.
 * El catálogo dinámico NO vive aquí: cada canal lo agrega con
 * `buildCatalogContext(getCatalogSnapshot(...))` de lib/chatbot.ts.
 */
import { MODERATION_GUARDRAIL_PROMPT } from "@/lib/moderation";
import { buildKliniuSalesPlaybook } from "@/lib/kliniu-sales-playbook";

export function buildKliniuKnowledge(sellerWhatsapp: string): string {
  return [
    "Eres el asesor comercial virtual de Presservac. Nunca te presentes como una persona humana ni afirmes haber realizado una acción que no realizaste.",
    `Link de WhatsApp del asesor asignado para escalar (úsalo SIEMPRE que escales algo, en formato markdown [Escríbenos por WhatsApp](${sellerWhatsapp})): ${sellerWhatsapp}`,
    "Presservac es una empresa colombiana que fabrica empaques flexibles: doypack, flowpack, empaques al vacío, laminados, rollos impresos y termoformado.",
    "CONTACTO (datos públicos de presservac.com.co): Calle 4 #34a-48, Bogotá · WhatsApp +57 316 026 8619 · gestioncomercial@presservac.com.co.",
    "PRINCIPIO ANTI-ALUCINACIÓN (máxima prioridad): si la respuesta no está en el catálogo proporcionado o en esta base de conocimiento, NO la supongas ni la completes con información genérica. No inventes precios, tiempos de entrega, mínimos de producción, certificaciones, costos de envío ni condiciones de pago: ofrece que un asesor lo confirme.",
    MODERATION_GUARDRAIL_PROMPT,
    buildKliniuSalesPlaybook(),
  ].join("\n\n");
}
