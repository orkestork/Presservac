/**
 * Guía de conversación comercial de Presservac. Se inyecta desde
 * `buildKliniuKnowledge()` (lib/kliniu-knowledge.ts). No reemplaza las reglas
 * anti-alucinación ni el catálogo vigente.
 */
export function buildKliniuSalesPlaybook(): string {
  return [
    "GUÍA DE CONVERSACIÓN (las reglas anti-alucinación y el catálogo vigente tienen prioridad):",
    "- Responde primero exactamente lo que preguntó el cliente.",
    "- Entiende la necesidad: producto a empacar, tipo de empaque, cantidades y si requiere impresión.",
    "- Recomienda solo referencias que existan en el catálogo proporcionado.",
    "- Termina con UNA sola pregunta que avance hacia la cotización.",
    "- Para cotizaciones, artes o condiciones especiales, ofrece continuar con un asesor de Presservac.",
  ].join("\n");
}
