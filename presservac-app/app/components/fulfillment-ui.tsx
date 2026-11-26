"use client";
import { MdCheck } from "react-icons/md";

export const STAGES: { key: string; label: string }[] = [
  { key: "PRODUCTION", label: "Producción" },
  { key: "BALANCE_CHECK", label: "Financiera: saldo" },
  { key: "LOGISTICS", label: "Logística coordina" },
  { key: "IN_TRANSIT", label: "En entrega" },
  { key: "DELIVERED", label: "Entregado" },
  { key: "CLOSED", label: "Finalizado" },
];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export function StageStepper({ stage }: { stage: string }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="flex items-start">
      {STAGES.map((s, i) => {
        const done = i < idx || stage === "CLOSED";
        const active = i === idx && stage !== "CLOSED";
        return (
          <li key={s.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-20 flex-col items-center text-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${done ? "bg-[#16A34A] text-white" : active ? "bg-[#D60517] text-white ring-4 ring-[#D60517]/15" : "bg-[#E2E8F0] text-[#94A3B8]"}`}>
                {done ? <MdCheck /> : i + 1}
              </span>
              <span className={`mt-1 text-[10px] font-bold leading-tight ${active ? "text-[#D60517]" : done ? "text-[#15803D]" : "text-[#94A3B8]"}`}>{s.label}</span>
            </div>
            {i < STAGES.length - 1 && <span className={`mt-3.5 h-0.5 flex-1 ${i < idx || stage === "CLOSED" ? "bg-[#16A34A]" : "bg-[#E2E8F0]"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Firma y fotos de la entrega. */
export function Evidence({ orderId, hasSignature, photos }: { orderId: string; hasSignature: boolean; photos: number }) {
  const base = `/api/panel/despachos/${orderId}/evidencia`;
  return (
    <div className="flex flex-wrap gap-2">
      {hasSignature && (
        <a href={`${base}/firma`} target="_blank" rel="noopener noreferrer" className="block h-20 w-32 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white" title="Firma">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/firma`} alt="Firma" className="h-full w-full object-contain" />
        </a>
      )}
      {Array.from({ length: photos }).map((_, i) => (
        <a key={i} href={`${base}/${i}`} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl border border-[#E2E8F0]" title={`Foto ${i + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/${i}`} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}
