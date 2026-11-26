export const PLANT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:     { label: "Por empezar", color: "#64748B", bg: "#F1F5F9" },
  IN_PROGRESS: { label: "En producción", color: "#2563EB", bg: "#DBEAFE" },
  DONE:        { label: "Terminada", color: "#15803D", bg: "#DCFCE7" },
  CANCELLED:   { label: "Cancelada", color: "#94A3B8", bg: "#F1F5F9" },
};

export function duration(fromIso: string, toMs: number) {
  const mins = Math.max(0, Math.round((toMs - new Date(fromIso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
  return `${Math.floor(h / 24)} días`;
}
