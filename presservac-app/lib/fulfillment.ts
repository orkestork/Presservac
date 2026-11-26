import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEffectivePermission } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import type { PublicUser } from "@/lib/users";
import { createNotification } from "@/lib/notifications";
import { saveDesignFile } from "@/lib/design-storage";
import { PAYMENT_KINDS, PAYMENT_METHODS, quoteTotal } from "@/lib/finance";

// Después de producción: operación libera → financiera verifica saldo → logística coordina
// → conductor entrega (firma y fotos) → financiera finaliza el pedido.

export type Stage = "PRODUCTION" | "BALANCE_CHECK" | "LOGISTICS" | "IN_TRANSIT" | "DELIVERED" | "CLOSED";

export const SHIPMENT_MODES: Record<string, string> = { PROPIO: "Vehículo propio", TRANSPORTADORA: "Transportadora", RECOGE: "El cliente recoge" };
export const MAX_PHOTOS = 6;

async function perms(user: PublicUser) {
  const [plant, fin, log] = await Promise.all([
    getEffectivePermission(user, "MODULE_PLANTA"),
    getEffectivePermission(user, "MODULE_FINANZAS"),
    getEffectivePermission(user, "MODULE_LOGISTICA"),
  ]);
  const admin = isAdmin(user);
  return {
    canRelease: plant.canCreate || admin,
    finance: fin.canEdit || admin,
    financeView: fin.canView || admin,
    logistics: log.canEdit || admin,
    logisticsView: log.canView || admin,
  };
}

const orderSelect = {
  id: true, number: true, reference: true, description: true, quantity: true, dueDate: true, status: true, stage: true,
  releasedAt: true, balanceApprovedAt: true, balanceNote: true, closedAt: true, finishedAt: true, quotationId: true,
  quotation: {
    select: {
      id: true, number: true, clientName: true, clientNit: true, clientAddress: true, clientCity: true, clientContact: true,
      clientPhone: true, sellerId: true, paymentTerms: true, seller: { select: { fullName: true } },
      payments: { orderBy: { createdAt: "asc" as const }, select: { id: true, kind: true, amount: true, method: true, reference: true, paidAt: true } },
    },
  },
  shipment: true,
};

type Row = NonNullable<Awaited<ReturnType<typeof findOrder>>>;
function findOrder(id: string) {
  return prisma!.plantOrder.findUnique({ where: { id }, select: orderSelect });
}

async function mapOrder(o: Row) {
  const total = await quoteTotal(o.quotationId);
  const paid = o.quotation.payments.reduce((s, p) => s + p.amount, 0);
  const sh = o.shipment;
  return {
    id: o.id, number: o.number, reference: o.reference, description: o.description, quantity: o.quantity,
    dueDate: o.dueDate?.toISOString() ?? null, status: o.status, stage: o.stage as Stage,
    releasedAt: o.releasedAt?.toISOString() ?? null, balanceApprovedAt: o.balanceApprovedAt?.toISOString() ?? null,
    balanceNote: o.balanceNote, closedAt: o.closedAt?.toISOString() ?? null, finishedAt: o.finishedAt?.toISOString() ?? null,
    quotation: {
      id: o.quotation.id, number: o.quotation.number, clientName: o.quotation.clientName, clientNit: o.quotation.clientNit,
      clientAddress: o.quotation.clientAddress, clientCity: o.quotation.clientCity, clientContact: o.quotation.clientContact,
      clientPhone: o.quotation.clientPhone, sellerName: o.quotation.seller.fullName, paymentTerms: o.quotation.paymentTerms,
    },
    money: {
      total, paid, balance: Math.max(0, total - paid),
      credit: o.quotation.payments.some((p) => p.kind === "CREDITO"),
      payments: o.quotation.payments.map((p) => ({
        id: p.id, kind: PAYMENT_KINDS[p.kind] ?? p.kind, amount: p.amount, method: p.method ? PAYMENT_METHODS[p.method] ?? p.method : null,
        reference: p.reference, paidAt: p.paidAt.toISOString(),
      })),
    },
    shipment: sh ? {
      id: sh.id, mode: sh.mode, modeLabel: SHIPMENT_MODES[sh.mode] ?? sh.mode, scheduledDate: sh.scheduledDate?.toISOString() ?? null,
      address: sh.address, city: sh.city, contactName: sh.contactName, contactPhone: sh.contactPhone,
      driverName: sh.driverName, driverPhone: sh.driverPhone, vehiclePlate: sh.vehiclePlate,
      carrierName: sh.carrierName, trackingNumber: sh.trackingNumber, packages: sh.packages, notes: sh.notes,
      token: sh.token, dispatchedAt: sh.dispatchedAt?.toISOString() ?? null, deliveredAt: sh.deliveredAt?.toISOString() ?? null,
      receiverName: sh.receiverName, receiverDoc: sh.receiverDoc, hasSignature: Boolean(sh.signatureKey),
      photos: sh.photoKeys.length, deliveryNotes: sh.deliveryNotes, lat: sh.lat, lng: sh.lng,
      incidents: (Array.isArray(sh.incidents) ? sh.incidents : []) as { at: string; text: string }[],
    } : null,
  };
}

export type FulfillmentOrder = Awaited<ReturnType<typeof mapOrder>>;

export async function listByStages(stages: Stage[], take = 100) {
  if (!prisma) return [];
  const rows = await prisma.plantOrder.findMany({
    where: { stage: { in: stages }, status: { not: "CANCELLED" } },
    select: orderSelect,
    orderBy: [{ updatedAt: "desc" }],
    take,
  });
  return Promise.all(rows.map(mapOrder));
}

export async function getFulfillmentOrder(id: string, user?: PublicUser) {
  if (!prisma) return null;
  const o = await findOrder(id);
  if (!o) return null;
  if (user && !(await canSeeFulfillment(user, o.quotation.sellerId))) return null;
  return mapOrder(o);
}

// ── 1. Operación libera ──
export async function releaseOrder(user: PublicUser, id: string) {
  const p = await perms(user);
  if (!p.canRelease) throw new Error("FORBIDDEN");
  const o = await findOrder(id);
  if (!o) throw new Error("NOT_FOUND");
  if (o.status !== "DONE") throw new Error("NOT_FINISHED");
  if (o.stage !== "PRODUCTION") throw new Error("INVALID_TRANSITION");
  await prisma!.plantOrder.update({ where: { id }, data: { stage: "BALANCE_CHECK", releasedAt: new Date(), releasedById: user.id } });
  createNotification({
    eventKey: "fulfillment.balance",
    title: "Verificar saldo antes de despachar",
    detail: `OP-${o.number} · ${o.reference} · ${o.quotation.clientName}`,
    href: "/panel/finanzas?tab=saldos",
    createdById: user.id,
  }).catch(() => {});
}

// ── 2. Financiera verifica el saldo ──
export type BalanceInput = {
  kind: "SALDO" | "CREDITO" | "PAGADO"; amount?: number | null; method?: string | null; reference?: string | null; paidAt?: string | null; notes?: string | null;
};

export async function approveBalance(user: PublicUser, id: string, input: BalanceInput, receipt?: File | null) {
  const p = await perms(user);
  if (!p.finance) throw new Error("FORBIDDEN");
  const o = await findOrder(id);
  if (!o) throw new Error("NOT_FOUND");
  if (o.stage !== "BALANCE_CHECK") throw new Error("INVALID_TRANSITION");
  const amount = Math.round(Number(input.amount ?? 0));
  if (input.kind === "SALDO" && !(amount > 0)) throw new Error("AMOUNT_REQUIRED");
  if (!["SALDO", "CREDITO", "PAGADO"].includes(input.kind)) throw new Error("INVALID_KIND");
  const saved = receipt && receipt.size > 0 ? await saveDesignFile(receipt, "pagos") : null;
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  await prisma!.$transaction(async (tx) => {
    if (input.kind !== "PAGADO") {
      await tx.quotationPayment.create({
        data: {
          quotationId: o.quotationId, kind: input.kind, amount: input.kind === "SALDO" ? amount : Math.max(0, amount || 0),
          method: input.method && PAYMENT_METHODS[input.method] ? input.method : null,
          reference: input.reference?.trim().slice(0, 120) || null,
          paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
          receiptKey: saved?.key ?? null, receiptName: saved ? receipt!.name.slice(0, 200) : null, receiptMime: saved?.mimeType ?? null,
          notes: input.notes?.trim().slice(0, 500) || null, confirmedById: user.id,
        },
      });
    }
    await tx.plantOrder.update({ where: { id }, data: { stage: "LOGISTICS", balanceApprovedAt: new Date(), balanceApprovedById: user.id, balanceNote: null } });
  });

  createNotification({
    eventKey: "fulfillment.logistics",
    title: "Pedido listo para despachar",
    detail: `OP-${o.number} · ${o.reference} · ${o.quotation.clientName}`,
    href: "/panel/despachos",
    createdById: user.id,
  }).catch(() => {});
}

export async function balancePending(user: PublicUser, id: string, note: string) {
  const p = await perms(user);
  if (!p.finance) throw new Error("FORBIDDEN");
  const text = note.trim().slice(0, 500);
  if (!text) throw new Error("NOTE_REQUIRED");
  const o = await findOrder(id);
  if (!o) throw new Error("NOT_FOUND");
  await prisma!.plantOrder.update({ where: { id }, data: { balanceNote: text } });
  createNotification({
    eventKey: "fulfillment.balance_pending",
    title: "El cliente debe el saldo",
    detail: `OP-${o.number} · ${o.quotation.clientName}: ${text}`,
    href: `/panel/planta/${o.id}`,
    targetUserId: o.quotation.sellerId,
    createdById: user.id,
  }).catch(() => {});
}

// ── 3. Logística coordina y despacha ──
export type DispatchInput = {
  mode: string; scheduledDate?: string | null; address?: string; city?: string; contactName?: string | null; contactPhone?: string | null;
  driverName?: string | null; driverPhone?: string | null; vehiclePlate?: string | null; carrierName?: string | null;
  trackingNumber?: string | null; packages?: number | null; notes?: string | null;
};

const clean = (v: string | null | undefined, max = 160) => (v ?? "").trim().slice(0, max) || null;

export async function dispatchOrder(user: PublicUser, id: string, input: DispatchInput) {
  const p = await perms(user);
  if (!p.logistics) throw new Error("FORBIDDEN");
  const o = await findOrder(id);
  if (!o) throw new Error("NOT_FOUND");
  if (o.stage !== "LOGISTICS" && o.stage !== "IN_TRANSIT") throw new Error("INVALID_TRANSITION");
  if (!SHIPMENT_MODES[input.mode]) throw new Error("INVALID_MODE");
  if (input.mode !== "RECOGE" && !clean(input.address)) throw new Error("ADDRESS_REQUIRED");
  if (input.mode === "PROPIO" && !clean(input.driverName)) throw new Error("DRIVER_REQUIRED");
  if (input.mode === "TRANSPORTADORA" && !clean(input.carrierName)) throw new Error("CARRIER_REQUIRED");
  const date = input.scheduledDate ? new Date(input.scheduledDate) : null;
  const pk = Math.round(Number(input.packages));

  const data = {
    mode: input.mode,
    scheduledDate: date && !Number.isNaN(date.getTime()) ? date : null,
    address: clean(input.address, 200) ?? "", city: clean(input.city, 80) ?? "",
    contactName: clean(input.contactName), contactPhone: clean(input.contactPhone, 40),
    driverName: input.mode === "PROPIO" ? clean(input.driverName) : null,
    driverPhone: input.mode === "PROPIO" ? clean(input.driverPhone, 40) : null,
    vehiclePlate: input.mode === "PROPIO" ? clean(input.vehiclePlate, 12)?.toUpperCase() ?? null : null,
    carrierName: input.mode === "TRANSPORTADORA" ? clean(input.carrierName) : null,
    trackingNumber: input.mode === "TRANSPORTADORA" ? clean(input.trackingNumber, 80) : null,
    packages: Number.isFinite(pk) && pk > 0 ? pk : null,
    notes: clean(input.notes, 500),
  };
  await prisma!.$transaction(async (tx) => {
    await tx.shipment.upsert({
      where: { orderId: id },
      create: { orderId: id, ...data, token: randomBytes(24).toString("base64url"), dispatchedAt: new Date(), dispatchedById: user.id },
      update: data,
    });
    await tx.plantOrder.update({ where: { id }, data: { stage: "IN_TRANSIT" } });
  });
  return getFulfillmentOrder(id);
}

// ── 4. Entrega (conductor por enlace, o logística para transportadora / recoge) ──
export type DeliveryInput = { receiverName?: string; receiverDoc?: string; notes?: string; lat?: number | null; lng?: number | null };

async function saveDelivery(shipmentId: string, orderId: string, input: DeliveryInput, signature: File | null, photos: File[]) {
  if (!clean(input.receiverName)) throw new Error("RECEIVER_REQUIRED");
  if (!signature && photos.length === 0) throw new Error("EVIDENCE_REQUIRED");
  const sig = signature && signature.size > 0 ? await saveDesignFile(signature, "entregas") : null;
  const pics: { key: string }[] = [];
  for (const f of photos.slice(0, MAX_PHOTOS)) if (f.size > 0) pics.push(await saveDesignFile(f, "entregas"));
  const lat = Number(input.lat), lng = Number(input.lng);
  const o = await prisma!.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        deliveredAt: new Date(), receiverName: clean(input.receiverName), receiverDoc: clean(input.receiverDoc, 30),
        signatureKey: sig?.key ?? null, photoKeys: pics.map((p) => p.key), deliveryNotes: clean(input.notes, 500),
        lat: Number.isFinite(lat) && lat !== 0 ? lat : null, lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
      },
    });
    return tx.plantOrder.update({ where: { id: orderId }, data: { stage: "DELIVERED" }, select: { number: true, reference: true, quotation: { select: { clientName: true, sellerId: true } } } });
  });
  for (const target of [undefined, o.quotation.sellerId]) {
    createNotification({
      eventKey: "fulfillment.delivered",
      title: "Pedido entregado",
      detail: `OP-${o.number} · ${o.reference} · ${o.quotation.clientName}${target ? "" : " · falta finalizar"}`,
      href: target ? `/panel/planta/${orderId}` : "/panel/finanzas?tab=cerrar",
      ...(target ? { targetUserId: target, targetRoles: [] } : {}),
    }).catch(() => {});
  }
}

export async function getShipmentByToken(token: string) {
  if (!prisma || !/^[\w-]{20,64}$/.test(token)) return null;
  const sh = await prisma.shipment.findUnique({
    where: { token },
    include: { order: { select: { id: true, number: true, reference: true, description: true, quantity: true, stage: true, quotation: { select: { clientName: true } } } } },
  });
  if (!sh || sh.mode !== "PROPIO") return null;
  return {
    number: sh.order.number, reference: sh.order.reference, description: sh.order.description, quantity: sh.order.quantity,
    clientName: sh.order.quotation.clientName, stage: sh.order.stage,
    address: sh.address, city: sh.city, contactName: sh.contactName, contactPhone: sh.contactPhone, packages: sh.packages, notes: sh.notes,
    driverName: sh.driverName, scheduledDate: sh.scheduledDate?.toISOString() ?? null, deliveredAt: sh.deliveredAt?.toISOString() ?? null,
    receiverName: sh.receiverName,
  };
}

export async function deliverByToken(token: string, input: DeliveryInput, signature: File | null, photos: File[]) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const sh = await prisma.shipment.findUnique({ where: { token }, include: { order: { select: { id: true, stage: true } } } });
  if (!sh || sh.mode !== "PROPIO") throw new Error("NOT_FOUND");
  if (sh.order.stage !== "IN_TRANSIT") throw new Error("ALREADY_DELIVERED");
  await saveDelivery(sh.id, sh.order.id, input, signature, photos);
}

export async function reportIncidentByToken(token: string, text: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const t = text.trim().slice(0, 400);
  if (!t) throw new Error("NOTE_REQUIRED");
  const sh = await prisma.shipment.findUnique({ where: { token }, include: { order: { select: { id: true, number: true, reference: true, stage: true } } } });
  if (!sh || sh.mode !== "PROPIO") throw new Error("NOT_FOUND");
  if (sh.order.stage !== "IN_TRANSIT") throw new Error("ALREADY_DELIVERED");
  const list = (Array.isArray(sh.incidents) ? sh.incidents : []) as { at: string; text: string }[];
  await prisma.shipment.update({ where: { id: sh.id }, data: { incidents: [...list, { at: new Date().toISOString(), text: t }].slice(-30) } });
  createNotification({
    eventKey: "fulfillment.incident",
    title: "Novedad en entrega",
    detail: `OP-${sh.order.number} · ${sh.order.reference}: ${t}`,
    href: "/panel/despachos",
  }).catch(() => {});
}

/** Logística registra la entrega cuando va por transportadora o el cliente recoge. */
export async function deliverByStaff(user: PublicUser, id: string, input: DeliveryInput, signature: File | null, photos: File[]) {
  const p = await perms(user);
  if (!p.logistics) throw new Error("FORBIDDEN");
  const o = await findOrder(id);
  if (!o?.shipment) throw new Error("NOT_FOUND");
  if (o.stage !== "IN_TRANSIT") throw new Error("INVALID_TRANSITION");
  await saveDelivery(o.shipment.id, o.id, input, signature, photos);
}

// ── 5. Financiera finaliza ──
export async function closeOrder(user: PublicUser, id: string) {
  const p = await perms(user);
  if (!p.finance) throw new Error("FORBIDDEN");
  const o = await findOrder(id);
  if (!o) throw new Error("NOT_FOUND");
  if (o.stage !== "DELIVERED") throw new Error("INVALID_TRANSITION");
  await prisma!.plantOrder.update({ where: { id }, data: { stage: "CLOSED", closedAt: new Date(), closedById: user.id } });
}

/** Logística, financiera, quien opera producción o el comercial dueño de la cotización. */
export async function canSeeFulfillment(user: PublicUser, sellerId: string) {
  const p = await perms(user);
  if (p.financeView || p.logisticsView || p.canRelease) return true;
  const plant = await getEffectivePermission(user, "MODULE_PLANTA");
  return plant.canEdit || sellerId === user.id;
}

/** Evidencia de entrega (firma o foto n). */
export async function getEvidenceKey(user: PublicUser, id: string, which: string) {
  const o = await findOrder(id);
  if (!o?.shipment) return null;
  if (!(await canSeeFulfillment(user, o.quotation.sellerId))) return null;
  if (which === "firma") return o.shipment.signatureKey;
  const n = Number(which);
  return Number.isInteger(n) && n >= 0 ? o.shipment.photoKeys[n] ?? null : null;
}

export async function fulfillmentCaps(user: PublicUser) {
  return perms(user);
}

export function fulfillmentErrorResponse(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  const map: Record<string, [string, number]> = {
    NOT_FOUND: ["No encontrado", 404],
    FORBIDDEN: ["No tienes permiso para este paso", 403],
    INVALID_TRANSITION: ["Este paso ya no aplica; recarga la página", 409],
    NOT_FINISHED: ["La orden aún tiene fases sin terminar", 409],
    AMOUNT_REQUIRED: ["Escribe el monto del saldo recibido", 400],
    INVALID_KIND: ["Elige cómo queda el saldo", 400],
    NOTE_REQUIRED: ["Escribe la nota", 400],
    INVALID_MODE: ["Elige cómo se envía", 400],
    ADDRESS_REQUIRED: ["Falta la dirección de entrega", 400],
    DRIVER_REQUIRED: ["Falta el conductor", 400],
    CARRIER_REQUIRED: ["Falta la transportadora", 400],
    RECEIVER_REQUIRED: ["Escribe el nombre de quien recibe", 400],
    EVIDENCE_REQUIRED: ["Falta la firma o al menos una foto", 400],
    ALREADY_DELIVERED: ["Esta entrega ya fue registrada", 409],
    FILE_TOO_LARGE: ["Una foto supera 30 MB", 400],
    INVALID_FILE_TYPE: ["Las fotos deben ser JPG, PNG o WEBP", 400],
  };
  const [error, status] = map[m] ?? ["Error interno", 500];
  return Response.json({ error }, { status });
}
