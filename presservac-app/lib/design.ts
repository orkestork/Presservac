import { prisma } from "@/lib/prisma";
import { getEffectivePermission } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import type { PublicUser } from "@/lib/users";
import { deleteDesignFile, saveDesignFile } from "@/lib/design-storage";
import { createNotification } from "@/lib/notifications";
import { createPlantOrder } from "@/lib/plant";
import { requestPaymentConfirmation } from "@/lib/finance";

// Flujo: Comercial pasa la referencia → Diseño sube el arte → revisión interna de diseño
// → aprobación final del comercial. Cualquier revisión puede devolverlo con cambios.

export const DESIGN_HISTORY_LIMIT = 5; // versiones anteriores que se conservan (más la actual)

export type DesignStatusKey = "AWAITING_PAYMENT" | "PENDING" | "IN_PROGRESS" | "INTERNAL_REVIEW" | "COMMERCIAL_REVIEW" | "APPROVED" | "CANCELLED";

export type DesignAction =
  | "take" | "internal_approve" | "internal_changes" | "commercial_approve" | "commercial_changes" | "cancel";

export type DesignCaps = {
  canDesign: boolean;
  canApproveInternal: boolean;
  canApproveCommercial: boolean;
  canCancel: boolean;
};

async function userCaps(user: PublicUser) {
  const [design, approve] = await Promise.all([
    getEffectivePermission(user, "MODULE_DISENO"),
    getEffectivePermission(user, "MODULE_DISENO_APROBAR"),
  ]);
  return { canDesign: design.canEdit, canApproveInternal: approve.canView, canCreate: design.canCreate, admin: isAdmin(user) };
}

function capsFor(
  base: Awaited<ReturnType<typeof userCaps>>,
  user: PublicUser,
  r: { requestedById: string; quotation: { sellerId: string } },
): DesignCaps {
  const isCommercialOwner = base.admin || r.requestedById === user.id || r.quotation.sellerId === user.id;
  return {
    canDesign: base.canDesign,
    canApproveInternal: base.canApproveInternal,
    canApproveCommercial: isCommercialOwner,
    canCancel: isCommercialOwner,
  };
}

/** Quien no es de diseño ni aprueba solo ve las solicitudes de sus cotizaciones. */
async function visibilityWhere(user: PublicUser) {
  const c = await userCaps(user);
  if (c.admin || c.canDesign || c.canApproveInternal) return {};
  return { OR: [{ requestedById: user.id }, { quotation: { sellerId: user.id } }] };
}

const listInclude = {
  quotation: { select: { id: true, number: true, clientName: true, sellerId: true, seller: { select: { fullName: true } } } },
  designer: { select: { id: true, fullName: true } },
  requestedBy: { select: { id: true, fullName: true } },
  versions: { orderBy: { version: "desc" as const }, take: 1, select: { id: true, version: true, mimeType: true, createdAt: true } },
};

export async function listDesignRequests(user: PublicUser, opts: { quotationId?: string } = {}) {
  if (!prisma) return [];
  const where = { ...(await visibilityWhere(user)), ...(opts.quotationId ? { quotationId: opts.quotationId } : {}) };
  const base = await userCaps(user);
  const rows = await prisma.designRequest.findMany({ where, include: listInclude, orderBy: { updatedAt: "desc" }, take: 500 });
  return rows.map((r) => {
    const caps = capsFor(base, user, r);
    return {
      id: r.id,
      number: r.number,
      reference: r.reference,
      description: r.description,
      status: r.status,
      dueDate: r.dueDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      quotation: { id: r.quotation.id, number: r.quotation.number, clientName: r.quotation.clientName, sellerName: r.quotation.seller.fullName },
      designer: r.designer,
      requestedBy: r.requestedBy,
      latest: r.versions[0] ? { ...r.versions[0], createdAt: r.versions[0].createdAt.toISOString() } : null,
      myTurn:
        ((r.status === "PENDING" || r.status === "IN_PROGRESS") && caps.canDesign && (!r.designerId || r.designerId === user.id)) ||
        (r.status === "INTERNAL_REVIEW" && caps.canApproveInternal) ||
        (r.status === "COMMERCIAL_REVIEW" && caps.canApproveCommercial),
    };
  });
}

/** Líneas de la cotización que corresponden a la referencia del arte (para saber qué y cuánto producir). */
async function matchingQuoteItems(r: { quotationId: string; reference: string; widthCm: number | null; lengthCm: number | null }) {
  const items = await prisma!.quotationItem.findMany({ where: { quotationId: r.quotationId, structure: { not: null } }, orderBy: { order: "asc" } });
  const sameDims = (i: { widthCm: number | null; lengthCm: number | null }) => r.widthCm == null || (i.widthCm === r.widthCm && i.lengthCm === r.lengthCm);
  const byRef = items.filter((i) => (i.reference ?? "") === r.reference && sameDims(i));
  return byRef.length ? byRef : items.filter(sameDims);
}

export async function getDesignRequest(user: PublicUser, id: string) {
  if (!prisma) return null;
  const r = await prisma.designRequest.findFirst({
    where: { id, ...(await visibilityWhere(user)) },
    include: {
      quotation: { select: { id: true, number: true, clientName: true, clientContact: true, sellerId: true, seller: { select: { fullName: true } } } },
      designer: { select: { id: true, fullName: true } },
      requestedBy: { select: { id: true, fullName: true } },
      versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { fullName: true } } } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { fullName: true } } } },
    },
  });
  if (!r) return null;
  const caps = capsFor(await userCaps(user), user, r);
  const lines = await matchingQuoteItems(r);
  const plant = await prisma.plantOrder.findUnique({ where: { designRequestId: r.id }, select: { id: true, number: true, status: true } });
  return {
    productionOptions: Array.from(new Set(lines.map((l) => l.quantity))).sort((a, b) => a - b),
    plantOrder: plant,
    id: r.id,
    number: r.number,
    reference: r.reference,
    description: r.description,
    widthCm: r.widthCm,
    lengthCm: r.lengthCm,
    brief: r.brief,
    dueDate: r.dueDate?.toISOString() ?? null,
    status: r.status,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    quotation: { id: r.quotation.id, number: r.quotation.number, clientName: r.quotation.clientName, clientContact: r.quotation.clientContact, sellerName: r.quotation.seller.fullName },
    designer: r.designer,
    requestedBy: r.requestedBy,
    versions: r.versions.map((v) => ({
      id: v.id, version: v.version, fileName: v.fileName, mimeType: v.mimeType, size: v.size, note: v.note,
      uploadedBy: v.uploadedBy.fullName, createdAt: v.createdAt.toISOString(),
    })),
    events: r.events.map((e) => ({ id: e.id, type: e.type, comment: e.comment, version: e.version, actor: e.actor.fullName, createdAt: e.createdAt.toISOString() })),
    caps,
    historyLimit: DESIGN_HISTORY_LIMIT,
  };
}

export type CreateDesignInput = {
  quotationId: string;
  brief?: string | null;
  dueDate?: string | null;
  references: { reference: string; description?: string; widthCm?: number | null; lengthCm?: number | null }[];
};

export async function createDesignRequests(user: PublicUser, input: CreateDesignInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await prisma.quotation.findUnique({ where: { id: input.quotationId }, select: { id: true, number: true, sellerId: true, clientName: true, status: true, paymentStatus: true } });
  if (!q) throw new Error("NOT_FOUND");
  if (!isAdmin(user) && q.sellerId !== user.id) throw new Error("FORBIDDEN");
  if (q.status === "REJECTED" || q.status === "EXPIRED") throw new Error("QUOTATION_CLOSED");
  const refs = (input.references ?? []).filter((r) => r.reference?.trim()).slice(0, 20);
  if (refs.length === 0) throw new Error("NO_REFERENCES");
  const due = input.dueDate ? new Date(input.dueDate) : null;
  // Sin pago confirmado por financiera, diseño no puede empezar.
  const paid = q.paymentStatus === "CONFIRMED";

  const created = await prisma.$transaction(
    refs.map((r) =>
      prisma!.designRequest.create({
        data: {
          quotationId: q.id,
          reference: r.reference.trim().slice(0, 120),
          description: (r.description ?? "").slice(0, 300),
          widthCm: r.widthCm ?? null,
          lengthCm: r.lengthCm ?? null,
          brief: input.brief?.trim() || null,
          dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
          requestedById: user.id,
          status: paid ? "PENDING" : "AWAITING_PAYMENT",
          events: { create: { actorId: user.id, type: "CREATED", comment: input.brief?.trim() || null } },
        },
      }),
    ),
  );
  if (!paid) {
    await requestPaymentConfirmation(user.id, q.id);
    return created;
  }
  createNotification({
    eventKey: "design.requested",
    title: "Nuevo arte por hacer",
    detail: `Cotización ${q.number} · ${q.clientName} · ${refs.map((r) => r.reference).join(", ")}`,
    href: created.length === 1 ? `/panel/diseno/${created[0].id}` : "/panel/diseno",
    createdById: user.id,
  }).catch(() => {});
  return created;
}

async function loadForAction(user: PublicUser, id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const r = await prisma.designRequest.findUnique({
    where: { id },
    include: { quotation: { select: { number: true, sellerId: true, clientName: true } }, _count: { select: { versions: true } } },
  });
  if (!r) throw new Error("NOT_FOUND");
  return { r, caps: capsFor(await userCaps(user), user, r) };
}

export async function runDesignAction(
  user: PublicUser, id: string, action: DesignAction, comment?: string | null,
  extra: { quantity?: number | null; dueDate?: string | null } = {},
) {
  const { r, caps } = await loadForAction(user, id);
  const note = comment?.trim() || null;
  const needsNote = action === "internal_changes" || action === "commercial_changes";
  if (needsNote && !note) throw new Error("COMMENT_REQUIRED");
  const qty = Math.round(Number(extra.quantity));
  if (action === "commercial_approve" && !(qty >= 1)) throw new Error("QUANTITY_REQUIRED");

  let next: DesignStatusKey;
  let event: string;
  switch (action) {
    case "take":
      if (!caps.canDesign) throw new Error("FORBIDDEN");
      if (r.status === "AWAITING_PAYMENT") throw new Error("AWAITING_PAYMENT");
      if (r.status !== "PENDING" && r.status !== "IN_PROGRESS") throw new Error("INVALID_TRANSITION");
      next = "IN_PROGRESS"; event = "TAKEN"; break;
    case "internal_approve":
    case "internal_changes":
      if (!caps.canApproveInternal) throw new Error("FORBIDDEN");
      if (r.status !== "INTERNAL_REVIEW") throw new Error("INVALID_TRANSITION");
      next = action === "internal_approve" ? "COMMERCIAL_REVIEW" : "IN_PROGRESS";
      event = action === "internal_approve" ? "INTERNAL_APPROVED" : "INTERNAL_CHANGES"; break;
    case "commercial_approve":
    case "commercial_changes":
      if (!caps.canApproveCommercial) throw new Error("FORBIDDEN");
      if (r.status !== "COMMERCIAL_REVIEW") throw new Error("INVALID_TRANSITION");
      next = action === "commercial_approve" ? "APPROVED" : "IN_PROGRESS";
      event = action === "commercial_approve" ? "COMMERCIAL_APPROVED" : "COMMERCIAL_CHANGES"; break;
    case "cancel":
      if (!caps.canCancel) throw new Error("FORBIDDEN");
      if (r.status === "APPROVED" || r.status === "CANCELLED") throw new Error("INVALID_TRANSITION");
      next = "CANCELLED"; event = "CANCELLED"; break;
    default:
      throw new Error("INVALID_ACTION");
  }

  const latest = await prisma!.designVersion.findFirst({ where: { requestId: id }, orderBy: { version: "desc" }, select: { version: true } });
  const updated = await prisma!.designRequest.update({
    where: { id },
    data: {
      status: next,
      ...(action === "take" ? { designerId: user.id } : {}),
      ...(next === "APPROVED" ? { approvedAt: new Date() } : {}),
      events: { create: { actorId: user.id, type: event, comment: note, version: latest?.version ?? null } },
    },
  });

  // Aprobado por comercial: pasa a producción con la cantidad confirmada.
  if (next === "APPROVED") {
    const line = (await matchingQuoteItems(r))[0];
    await createPlantOrder(user.id, {
      quotationId: r.quotationId,
      designRequestId: r.id,
      reference: r.reference,
      description: r.description,
      structure: line?.structure ?? null,
      bagType: line?.bagType ?? null,
      widthCm: line?.widthCm ?? r.widthCm,
      lengthCm: line?.lengthCm ?? r.lengthCm,
      gussetCm: line?.gussetCm ?? null,
      microns: line?.microns ?? null,
      zipper: line?.zipper ?? false,
      valve: line?.valve ?? false,
      printed: true,
      quantity: qty,
      dueDate: extra.dueDate ?? (r.dueDate ? r.dueDate.toISOString() : null),
    });
  }

  const href = `/panel/diseno/${id}`;
  const label = `${r.reference} · Cotización ${r.quotation.number}`;
  if (next === "COMMERCIAL_REVIEW") {
    createNotification({ eventKey: "design.commercial_review", title: "Arte listo para tu aprobación", detail: label, href, targetUserId: r.requestedById, createdById: user.id }).catch(() => {});
  } else if (needsNote && r.designerId) {
    createNotification({ eventKey: "design.changes", title: "Piden cambios en el arte", detail: `${label}: ${note}`, href, targetUserId: r.designerId, createdById: user.id }).catch(() => {});
  } else if (next === "APPROVED" && r.designerId) {
    createNotification({ eventKey: "design.approved", title: "Arte aprobado", detail: label, href, targetUserId: r.designerId, createdById: user.id }).catch(() => {});
  }
  return updated;
}

/** El diseñador sube una versión: queda en revisión interna. Se guardan la actual y las 5 anteriores. */
export async function uploadDesignVersion(user: PublicUser, id: string, file: File, note?: string | null) {
  const { r, caps } = await loadForAction(user, id);
  if (!caps.canDesign) throw new Error("FORBIDDEN");
  if (r.status === "AWAITING_PAYMENT") throw new Error("AWAITING_PAYMENT");
  if (r.status !== "PENDING" && r.status !== "IN_PROGRESS") throw new Error("INVALID_TRANSITION");

  const saved = await saveDesignFile(file);
  const last = await prisma!.designVersion.findFirst({ where: { requestId: id }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;

  const created = await prisma!.$transaction(async (tx) => {
    const v = await tx.designVersion.create({
      data: {
        requestId: id, version, fileKey: saved.key, fileUrl: "", fileName: file.name.slice(0, 200) || `arte-v${version}`,
        mimeType: saved.mimeType, size: saved.size, note: note?.trim() || null, uploadedById: user.id,
      },
    });
    await tx.designVersion.update({ where: { id: v.id }, data: { fileUrl: `/api/panel/diseno/archivo/${v.id}` } });
    await tx.designRequest.update({
      where: { id },
      data: {
        status: "INTERNAL_REVIEW",
        designerId: r.designerId ?? user.id,
        events: { create: { actorId: user.id, type: "UPLOADED", comment: note?.trim() || null, version } },
      },
    });
    return v;
  });

  // Historial: se borran las versiones más viejas que excedan el límite.
  const old = await prisma!.designVersion.findMany({
    where: { requestId: id }, orderBy: { version: "desc" }, skip: DESIGN_HISTORY_LIMIT + 1, select: { id: true, fileKey: true },
  });
  if (old.length) {
    await prisma!.designVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    await Promise.all(old.map((o) => deleteDesignFile(o.fileKey)));
  }

  createNotification({
    eventKey: "design.internal_review",
    title: "Arte para revisión interna",
    detail: `${r.reference} · v${version} · Cotización ${r.quotation.number}`,
    href: `/panel/diseno/${id}`,
    createdById: user.id,
  }).catch(() => {});
  return created;
}

/** ¿Puede este usuario ver el archivo? Igual que ver la solicitud. */
export async function getDesignFileForUser(user: PublicUser, versionId: string) {
  if (!prisma) return null;
  const v = await prisma.designVersion.findUnique({ where: { id: versionId }, select: { requestId: true, fileKey: true, mimeType: true, fileName: true } });
  if (!v) return null;
  const visible = await prisma.designRequest.findFirst({ where: { id: v.requestId, ...(await visibilityWhere(user)) }, select: { id: true } });
  return visible ? v : null;
}

export function designErrorResponse(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  const map: Record<string, [string, number]> = {
    NOT_FOUND: ["No encontrado", 404],
    FORBIDDEN: ["No tienes permiso para este paso", 403],
    INVALID_TRANSITION: ["Este paso ya no aplica; recarga la página", 409],
    COMMENT_REQUIRED: ["Escribe qué hay que cambiar", 400],
    NO_REFERENCES: ["Elige al menos una referencia", 400],
    QUOTATION_CLOSED: ["La cotización está rechazada o vencida", 409],
    QUANTITY_REQUIRED: ["Indica cuántas unidades se van a producir", 400],
    AWAITING_PAYMENT: ["Financiera aún no confirma el pago del cliente", 409],
    FILE_TOO_LARGE: ["El archivo supera 30 MB", 400],
    INVALID_FILE_TYPE: ["Sube el arte en PDF (o .ai con compatibilidad PDF), PNG, JPG o WEBP", 400],
  };
  const [error, status] = map[m] ?? ["Error interno", 500];
  return Response.json({ error }, { status });
}
