import type { Metadata } from "next";
import { CotizacionesTabs } from "./_components/tabs";

export const metadata: Metadata = {
  title: "Cotizaciones — Panel Comercial",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CotizacionesTabs />
      {children}
    </>
  );
}
