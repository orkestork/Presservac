import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seguimiento de tu pedido | PRESSERVAC",
  robots: { index: false, follow: false },
};

export default function SeguimientoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
