"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QuoteBuilder, toBuilderInitial, type BuilderInitial } from "../_components/quote-builder";

function NuevaInner() {
  const from = useSearchParams().get("desde");
  const [initial, setInitial] = useState<BuilderInitial | undefined>(undefined);
  const [ready, setReady] = useState(!from);

  useEffect(() => {
    if (!from) return;
    fetch(`/api/panel/quotations/${from}`)
      .then((r) => r.json())
      .then((q) => { if (q && !q.error) setInitial(toBuilderInitial(q, true)); })
      .finally(() => setReady(true));
  }, [from]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <Link href="/panel/cotizaciones" className="text-xs font-bold text-[#94A3B8] hover:text-[#1A1A1A]">← Cotizaciones</Link>
        <h1 className="mt-1 text-2xl font-black text-[#051C46]">{from ? "Nueva cotización (copia)" : "Nueva cotización"}</h1>
      </div>
      {ready ? <QuoteBuilder initial={initial} /> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D60517] border-t-transparent" />}
    </div>
  );
}

export default function NuevaCotizacionPage() {
  return <Suspense><NuevaInner /></Suspense>;
}
