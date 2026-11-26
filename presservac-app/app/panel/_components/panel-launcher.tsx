"use client";

import Link from "next/link";
import { AppTile, usePanelNav } from "./panel-nav";

/** Lanzador de apps del inicio del panel (estilo Workezt). */
export function PanelLauncher() {
  const { items, ready, firstName } = usePanelNav();
  const apps = items.filter((i) => i.key !== "inicio");
  const hour = new Date().getHours();
  const saludo = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <section className="mb-10">
      <p className="text-sm font-medium text-slate-500">{saludo}{firstName ? `, ${firstName}` : ""}</p>
      <h1 className="pv-display mt-1 text-[28px] font-semibold text-[#051C46] sm:text-[34px]">
        ¿Qué vamos a hacer <span className="text-[#D60517]">hoy</span>?
      </h1>
      <div className="mt-7 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
        {!ready
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2.5">
                <span className="h-[72px] w-[72px] animate-pulse rounded-[22px] bg-white/70" />
                <span className="h-3 w-16 animate-pulse rounded bg-white/70" />
              </div>
            ))
          : apps.map((app) => (
              <Link key={app.key} href={app.href} className="pv-launch group flex flex-col items-center gap-2.5 text-center">
                <span className="pv-launch-tile">
                  <AppTile item={app} size={60} />
                </span>
                <span className="text-[13px] font-semibold text-[#051C46]">{app.label}</span>
                {app.children && (
                  <span className="-mt-2 text-[11px] text-slate-500">{app.children.length} {app.children.length === 1 ? "sección" : "secciones"}</span>
                )}
              </Link>
            ))}
      </div>
    </section>
  );
}
