"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/panel/cotizaciones", label: "Cotizaciones" },
  { href: "/panel/cotizaciones/nueva", label: "+ Nueva cotización" },
  { href: "/panel/cotizaciones/tarifas", label: "Tarifas" },
];

export function CotizacionesTabs() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/panel/cotizaciones"
      ? path === href || /^\/panel\/cotizaciones\/(?!nueva|tarifas|simulador)[^/]+$/.test(path)
      : path.startsWith(href);
  return (
    <div className="border-b border-[#E2E8F0] bg-white px-6 lg:px-8 print:hidden">
      <nav className="flex gap-6">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 py-3 text-sm font-bold transition ${
              active(t.href) ? "border-[#D60517] text-[#051C46]" : "border-transparent text-[#64748B] hover:text-[#051C46]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
