"use client";

export function PhaseStrip({ phases, compact }: { phases: { name: string; status: string }[]; compact?: boolean }) {
  const firstOpen = phases.findIndex((p) => p.status === "IN_PROGRESS" || p.status === "PENDING");
  return (
    <div className="flex gap-1">
      {phases.map((p, i) => {
        const cls =
          p.status === "DONE" ? "bg-[#16A34A]" :
          p.status === "IN_PROGRESS" ? "bg-[#D60517] animate-pulse" :
          p.status === "SKIPPED" ? "bg-[repeating-linear-gradient(45deg,#E2E8F0_0_4px,#F8FAFC_4px_8px)]" :
          i === firstOpen ? "bg-[#FCA5A5]" : "bg-[#E2E8F0]";
        return <span key={i} title={`${p.name}: ${p.status === "DONE" ? "terminada" : p.status === "IN_PROGRESS" ? "en proceso" : p.status === "SKIPPED" ? "no aplica" : "pendiente"}`} className={`${compact ? "h-1.5" : "h-2.5"} flex-1 rounded-full ${cls}`} />;
      })}
    </div>
  );
}
