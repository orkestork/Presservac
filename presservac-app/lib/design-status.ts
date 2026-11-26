// Textos y colores del flujo de diseño (se usan en cliente y servidor).

export const DESIGN_STATUS: Record<string, { label: string; color: string; bg: string; step: number }> = {
  AWAITING_PAYMENT:  { label: "Esperando pago",       color: "#B45309", bg: "#FFEDD5", step: 1 },
  PENDING:           { label: "Por empezar",          color: "#64748B", bg: "#F1F5F9", step: 2 },
  IN_PROGRESS:       { label: "En diseño",            color: "#2563EB", bg: "#DBEAFE", step: 2 },
  INTERNAL_REVIEW:   { label: "Revisión de diseño",   color: "#B45309", bg: "#FEF3C7", step: 3 },
  COMMERCIAL_REVIEW: { label: "Aprobación comercial", color: "#7C3AED", bg: "#EDE9FE", step: 4 },
  APPROVED:          { label: "Aprobado",             color: "#15803D", bg: "#DCFCE7", step: 5 },
  CANCELLED:         { label: "Cancelado",            color: "#94A3B8", bg: "#F1F5F9", step: 0 },
};

export const DESIGN_STEPS = ["Comercial lo pide", "Financiera confirma el pago", "Diseño hace el arte", "Revisión de diseño", "Aprobación comercial", "Aprobado"];

export const DESIGN_EVENT_LABEL: Record<string, string> = {
  CREATED: "pidió el arte",
  PAYMENT_CONFIRMED: "confirmó el pago del cliente",
  TAKEN: "tomó el arte",
  UPLOADED: "subió una versión",
  INTERNAL_APPROVED: "aprobó en revisión de diseño",
  INTERNAL_CHANGES: "pidió cambios (revisión de diseño)",
  COMMERCIAL_APPROVED: "dio la aprobación final",
  COMMERCIAL_CHANGES: "pidió cambios (comercial)",
  CANCELLED: "canceló la solicitud",
};

export const isImageMime = (m: string) => m.startsWith("image/");
