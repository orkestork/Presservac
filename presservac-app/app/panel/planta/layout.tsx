import type { Metadata } from "next";
import { PlantaTabs } from "./_components/tabs";

export const metadata: Metadata = { title: "Producción — Panel" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlantaTabs />
      {children}
    </>
  );
}
