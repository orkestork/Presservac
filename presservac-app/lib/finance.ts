import { prisma } from "@/lib/prisma";
import { getEffectivePermission } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import type { PublicUser } from "@/lib/users";
import { createNotification } from "@/lib/notifications";
import { saveDesignFile } from "@/lib/design-storage";
import { getQuotationTaxConfig } from "@/lib/panel";

// Financiera confirma que el cliente pagó (anticipo, total o crédito) antes de que diseño empiece.

export const PAYMENT_KINDS: Record<string, string> = { ANTICIPO: "Anticipo", TOTAL: "Pago total", CREDITO: "Crédito aprobado", SALDO: "Saldo" };
export const PAYMENT_METHODS: Record<string, string> = {
  TRANSFERENCIA: "Transferencia", CONSIGNACION: "Consignación", EFECTIVO: "Efectivo", TARJETA: "Tarjeta", OTRO: "Otro",
};

async function financeCaps(user: PublicUser) {
  const p = await getEffectivePermission(user, "MODULE_FINANZAS");
  return { canView: p.canView || isAdmin(user), canConfirm: p.canEdit || isAdmin(user) };
}

/** Comercial dueño de la cotización, admin o financiera. */
async function canSeeQuotationPayment(user: PublicUser, q: { sellerId: string }) {
  if (isAdmin(user) || q.sellerId === user.id) return true;
  return (await financeCaps(user)).canView;
}

export async function quoteTotal(quotationId: string) {
  const [items, cfg] = await Promise.all([
    prisma!.quotationItem.findMany({ where: { quotationId }, select: { quantity: true, unitPrice: true } }),
    getQuotationTaxConfig(),
  ]);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return Math.round(subtotal * (1 + cfg.ivaPct / 100));
}

/** Marca la cotización como "pago por confirmar" y avisa a financiera (una sola vez). */
export async function requestPaymentConfirmation(userId: string, quotationId: string) {
  if (!prisma) return;
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { paymentStatus: true, number: true, clientName: true } });
  if (!q || q.paymentStatus !== "NONE") return;
  await prisma.quotation.update({ where: { id: quotationId }, data: { paymentStatus: "REQUESTED", paymentRequestedAt: new Date() } });
  createNotification({
    eventKey: "payment.requested",
    title: "Confirmar pago de cliente",
    detail: `Cotización ${q.number} · ${q.clientName}: diseño espera la confirmación del pago`,
    href: "/panel/finanzas",
    createdById: userId,
  }).catch(() => {});
}

export async function attachPaymentProof(user: PublicUser, quotationId: string, file: File) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { sellerId: true } });
  if (!q) throw new Error("NOT_FOUND");
  if (!isAdmin(user) && q.sellerId !== user.id) throw new Error("FORBIDDEN");
  const saved = await saveDesignFile(file, "pagos");
  await prisma.quotation.update({
    where: { id: quotationId },
    data: { paymentProofKey: saved.key, paymentProofName: file.name.slice(0, 200) || "comprobante", paymentProofMime: saved.mimeType },
  });
}

function mapPayment(p: { id: string; kind: string; amount: number; method: string | null; reference: string | null; paidAt: Date; receiptKey: string | null; notes: string | null; createdAt: Date; confirmedBy: { fullName: string } }) {
  return {
    id: p.id, kind: p.kind, kindLabel: PAYMENT_KINDS[p.kind] ?? p.kind, amount: p.amount, method: p.method,
    methodLabel: p.method ? PAYMENT_METHODS[p.method] ?? p.method : null, reference: p.reference,
    paidAt: p.paidAt.toISOString(), hasReceipt: Boolean(p.receiptKey), notes: p.notes,
    confirmedBy: p.confirmedBy.fullName, createdAt: p.createdAt.toISOString(),
  };
}

export async function getQuotationPayment(user: PublicUser, quotationId: string) {
  if (!prisma) return null;
  const q = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { payments: { orderBy: { createdAt: "desc" }, include: { confirmedBy: { select: { fullName: true } } } } },
  });
  if (!q || !(await canSeeQuotationPayment(user, q))) return null;
  const total = await quoteTotal(q.id);
  return {
    status: q.paymentStatus,
    requestedAt: q.paymentRequestedAt?.toISOString() ?? null,
    confirmedAt: q.paymentConfirmedAt?.toISOString() ?? null,
    financeNote: q.financeNote,
    proof: q.paymentProofKey ? { name: q.paymentProofName, mime: q.paymentProofMime } : null,
    total,
    paid: q.payments.reduce((s, p) => s + p.amount, 0),
    payments: q.payments.map(mapPayment),
  };
}

export async function listFinanceQueue(user: PublicUser) {
  if (!prisma) return { pending: [], confirmed: [] };
  if (!(await financeCaps(user)).canView) throw new Error("FORBIDDEN");
  const include = {
    seller: { select: { fullName: true } },
    designRequests: { where: { status: { not: "CANCELLED" as const } }, select: { reference: true, status: true } },
    payments: { orderBy: { createdAt: "desc" as const }, include: { confirmedBy: { select: { fullName: true } } } },
  };
  const [pending, confirmed] = await Promise.all([
    prisma.quotation.findMany({ where: { paymentStatus: "REQUESTED" }, include, orderBy: { paymentRequestedAt: "asc" } }),
    prisma.quotation.findMany({ where: { paymentStatus: "CONFIRMED" }, include, orderBy: { paymentConfirmedAt: "desc" }, take: 50 }),
  ]);
  const map = async (q: (typeof pending)[number]) => ({
    id: q.id, number: q.number, clientName: q.clientName, clientNit: q.clientNit, sellerName: q.seller.fullName,
    paymentTerms: q.paymentTerms, requestedAt: q.paymentRequestedAt?.toISOString() ?? null,
    confirmedAt: q.paymentConfirmedAt?.toISOString() ?? null, financeNote: q.financeNote,
    proof: q.paymentProofKey ? { name: q.paymentProofName, mime: q.paymentProofMime } : null,
    references: q.designRequests.map((d) => d.reference),
    total: await quoteTotal(q.id),
    paid: q.payments.reduce((s, p) => s + p.amount, 0),
    payments: q.payments.map(mapPayment),
  });
  return { pending: await Promise.all(pending.map(map)), confirmed: await Promise.all(confirmed.map(map)) };
}

export type ConfirmPaymentInput = {
  kind: string; amount?: number | null; method?: string | null; reference?: string | null; paidAt?: string | null; notes?: string | null;
};

/** Financiera confirma el pago: se registra y los artes que esperaban pasan a diseño. */
export async function confirmPayment(user: PublicUser, quotationId: string, input: ConfirmPaymentInput, receipt?: File | null) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!(await financeCaps(user)).canConfirm) throw new Error("FORBIDDEN");
  if (!PAYMENT_KINDS[input.kind]) throw new Error("INVALID_KIND");
  const amount = Math.round(Number(input.amount ?? 0));
  if (input.kind !== "CREDITO" && !(amount > 0)) throw new Error("AMOUNT_REQUIRED");
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { id: true, number: true, clientName: true, sellerId: true, paymentProofKey: true, paymentProofName: true, paymentProofMime: true } });
  if (!q) throw new Error("NOT_FOUND");
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  const savedReceipt = receipt && receipt.size > 0 ? await saveDesignFile(receipt, "pagos") : null;

  const released = await prisma.$transaction(async (tx) => {
    await tx.quotationPayment.create({
      data: {
        quotationId, kind: input.kind, amount: input.kind === "CREDITO" ? Math.max(0, amount || 0) : amount,
        method: input.method && PAYMENT_METHODS[input.method] ? input.method : null,
        reference: input.reference?.trim().slice(0, 120) || null,
        paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
        receiptKey: savedReceipt?.key ?? q.paymentProofKey,
        receiptName: savedReceipt ? receipt!.name.slice(0, 200) : q.paymentProofName,
        receiptMime: savedReceipt?.mimeType ?? q.paymentProofMime,
        notes: input.notes?.trim().slice(0, 500) || null,
        confirmedById: user.id,
      },
    });
    await tx.quotation.update({ where: { id: quotationId }, data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date(), financeNote: null } });
    const waiting = await tx.designRequest.findMany({ where: { quotationId, status: "AWAITING_PAYMENT" }, select: { id: true, reference: true } });
    for (const d of waiting) {
      await tx.designRequest.update({
        where: { id: d.id },
        data: { status: "PENDING", events: { create: { actorId: user.id, type: "PAYMENT_CONFIRMED", comment: `${PAYMENT_KINDS[input.kind]}${amount > 0 ? ` $${amount.toLocaleString("es-CO")}` : ""}` } } },
      });
    }
    return waiting;
  });

  if (released.length) {
    createNotification({
      eventKey: "payment.confirmed",
      title: "Pago confirmado: arte para hacer",
      detail: `Cotización ${q.number} · ${q.clientName} · ${released.map((r) => r.reference).join(", ")}`,
      href: "/panel/diseno",
      createdById: user.id,
    }).catch(() => {});
  }
  createNotification({
    eventKey: "payment.confirmed",
    title: "Financiera confirmó el pago",
    detail: `Cotización ${q.number} · ${q.clientName}`,
    href: `/panel/cotizaciones/${q.id}`,
    targetRoles: [],
    targetUserId: q.sellerId,
    createdById: user.id,
  }).catch(() => {});
  return { released: released.length };
}

/** "Aún no ha llegado": queda pendiente y se avisa a comercial con la nota. */
export async function markPaymentPending(user: PublicUser, quotationId: string, note: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!(await financeCaps(user)).canConfirm) throw new Error("FORBIDDEN");
  const text = note.trim().slice(0, 500);
  if (!text) throw new Error("NOTE_REQUIRED");
  const q = await prisma.quotation.update({ where: { id: quotationId }, data: { financeNote: text }, select: { number: true, clientName: true, sellerId: true, id: true } });
  createNotification({
    eventKey: "payment.pending",
    title: "Financiera aún no ve el pago",
    detail: `Cotización ${q.number} · ${q.clientName}: ${text}`,
    href: `/panel/cotizaciones/${q.id}`,
    targetUserId: q.sellerId,
    createdById: user.id,
  }).catch(() => {});
}

/** Archivo de soporte: el comprobante de comercial o el de un pago registrado. */
export async function getPaymentFile(user: PublicUser, quotationId: string, paymentId?: string | null) {
  if (!prisma) return null;
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { sellerId: true, paymentProofKey: true, paymentProofName: true, paymentProofMime: true } });
  if (!q || !(await canSeeQuotationPayment(user, q))) return null;
  if (paymentId) {
    const p = await prisma.quotationPayment.findFirst({ where: { id: paymentId, quotationId }, select: { receiptKey: true, receiptName: true, receiptMime: true } });
    return p?.receiptKey ? { key: p.receiptKey, name: p.receiptName ?? "soporte", mime: p.receiptMime ?? "application/octet-stream" } : null;
  }
  return q.paymentProofKey ? { key: q.paymentProofKey, name: q.paymentProofName ?? "comprobante", mime: q.paymentProofMime ?? "application/octet-stream" } : null;
}

export function financeErrorResponse(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  const map: Record<string, [string, number]> = {
    NOT_FOUND: ["No encontrado", 404],
    FORBIDDEN: ["No tienes permiso para esto", 403],
    INVALID_KIND: ["Elige el tipo de pago", 400],
    AMOUNT_REQUIRED: ["Escribe el monto recibido", 400],
    NOTE_REQUIRED: ["Escribe qué pasa con el pago", 400],
    FILE_TOO_LARGE: ["El archivo supera 30 MB", 400],
    INVALID_FILE_TYPE: ["El soporte debe ser PDF, PNG, JPG o WEBP", 400],
  };
  const [error, status] = map[m] ?? ["Error interno", 500];
  return Response.json({ error }, { status });
}
