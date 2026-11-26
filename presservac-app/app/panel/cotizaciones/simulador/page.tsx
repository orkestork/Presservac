import { redirect } from "next/navigation";

// El simulador quedó dentro de la pantalla de cotizar.
export default function SimuladorPage() {
  redirect("/panel/cotizaciones/nueva");
}
