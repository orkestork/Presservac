import { redirect } from "next/navigation";

/** El sitio público de Presservac vive aparte; esta app es el acceso de clientes y del equipo. */
export default function Home() {
  redirect("/login");
}
