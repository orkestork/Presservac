"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/panel/planta", label: "Órdenes" },
  { href: "/panel/planta/fases", label: "Fases de producción" },
];

export function PlantaTabs() {
  const path = usePathname();
  const active = (href: string) => (href === "/panel/planta" ? path === href || /^\/panel\/planta\/(?!fases)[^/]+$/.test(path) : path.startsWith(href));
  return (
    <div className="border-b border-[#E2E8F0] bg-white px-6 lg:px-8">
      <nav className="flex gap-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`-mb-px border-b-2 py-3 text-sm font-bold ${active(t.href) ? "border-[#D60517] text-[#051C46]" : "border-transparent text-[#64748B] hover:text-[#051C46]"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
