import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Entrega — Presservac", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#051C46" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
