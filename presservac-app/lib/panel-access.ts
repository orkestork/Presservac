import { requirePermission, type AuthResult } from "@/lib/permissions";
import type { PanelModule } from "@/generated/prisma/client";

/** Pasa si el usuario puede ver al menos uno de los módulos (para pantallas compartidas entre áreas). */
export async function requireAnyView(modules: PanelModule[]): Promise<AuthResult> {
  let last: AuthResult = { ok: false, status: 401 };
  for (const m of modules) {
    last = await requirePermission(m, "view");
    if (last.ok) return last;
  }
  return last;
}
