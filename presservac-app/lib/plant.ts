import { prisma } from "@/lib/prisma";
import { getEffectivePermission } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import type { PublicUser } from "@/lib/users";
import { createNotification } from "@/lib/notifications";

// Producción de empaques: cada orden copia las fases de una ruta y avanza fase por fase.

export type RoutePhase = { name: string; description?: string; unit?: string; onlyIfPrinted?: boolean };

export const DEFAULT_DOYPACK_ROUTE: { name: string; bagType: string; phases: RoutePhase[] } = {
  name: "Doypack",
  bagType: "DOYPACK",
  phases: [
    { name: "Alistamiento de material", description: "Películas, tintas, adhesivo, zipper y válvula listos según la ficha.", unit: "kg" },
    { name: "Impresión", description: "Impresión con los fotopolímeros del arte aprobado.", unit: "m", onlyIfPrinted: true },
    { name: "Laminación", description: "Unión de las capas (bilámina / trilámina).", unit: "m" },
    { name: "Curado", description: "Tiempo de reposo del laminado antes de cortar.", unit: "" },
    { name: "Refilado / corte", description: "Corte del rollo al ancho de trabajo.", unit: "m" },
    { name: "Sellado y formado del doypack", description: "Fuelle de fondo, sellos laterales, zipper / válvula y troquel.", unit: "und" },
    { name: "Control de calidad", description: "Medidas, sellos, impresión y prueba de vacío.", unit: "und" },
    { name: "Empaque y despacho", description: "Conteo, empaque en cajas y entrega a logística.", unit: "und" },
  ],
};

export function sanitizePhases(raw: unknown): RoutePhase[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => ({
      name: String(p.name ?? "").trim().slice(0, 80),
      description: String(p.description ?? "").trim().slice(0, 300) || undefined,
      unit: String(p.unit ?? "").trim().slice(0, 10),
      onlyIfPrinted: Boolean(p.onlyIfPrinted),
    }))
    .filter((p) => p.name)
    .slice(0, 30);
}

export async function getRoutes() {
  if (!prisma) return [];
  const count = await prisma.plantRoute.count();
  if (count === 0) {
    await prisma.plantRoute.create({ data: { name: DEFAULT_DOYPACK_ROUTE.name, bagType: DEFAULT_DOYPACK_ROUTE.bagType, phases: DEFAULT_DOYPACK_ROUTE.phases } });
  }
  const rows = await prisma.plantRoute.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, bagType: r.bagType, phases: sanitizePhases(r.phases) }));
}

export async function saveRoute(id: string, data: { name?: string; phases?: unknown }) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const phases = data.phases !== undefined ? sanitizePhases(data.phases) : undefined;
  if (phases && phases.length === 0) throw new Error("NO_PHASES");
  return prisma.plantRoute.update({
    where: { id },
    data: { ...(data.name?.trim() ? { name: data.name.trim().slice(0, 60) } : {}), ...(phases ? { phases } : {}) },
  });
}

/** Ruta para un tipo de bolsa: la suya o, si no hay, la primera (por ahora solo existe la de doypack). */
async function routeFor(bagType: string | null) {
  const routes = await getRoutes();
  return routes.find((r) => r.bagType === bagType) ?? routes[0];
}

async function caps(user: PublicUser) {
  const p = await getEffectivePermission(user, "MODULE_PLANTA");
  return { canOperate: p.canEdit, canManage: p.canCreate || isAdmin(user), admin: isAdmin(user) };
}

async function visibilityWhere(user: PublicUser) {
  const c = await caps(user);
  if (c.admin || c.canOperate || c.canManage) return {};
  // Comercial solo sigue las órdenes de sus cotizaciones.
  return { quotation: { sellerId: user.id } };
}

export type CreatePlantOrderInput = {
  quotationId: string;
  designRequestId?: string | null;
  reference: string;
  description?: string;
  structure?: string | null;
  bagType?: string | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  gussetCm?: number | null;
  microns?: number | null;
  zipper?: boolean;
  valve?: boolean;
  printed?: boolean;
  quantity: number;
  dueDate?: string | null;
  notes?: string | null;
};

export async function createPlantOrder(createdById: string, input: CreatePlantOrderInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const qty = Math.round(Number(input.quantity));
  if (!Number.isFinite(qty) || qty < 1) throw new Error("QUANTITY_REQUIRED");
  const route = await routeFor(input.bagType ?? null);
  if (!route) throw new Error("NO_ROUTE");
  const due = input.dueDate ? new Date(input.dueDate) : null;
  const printed = Boolean(input.printed);

  const order = await prisma.plantOrder.create({
    data: {
      quotationId: input.quotationId,
      designRequestId: input.designRequestId ?? null,
      reference: input.reference.slice(0, 120),
      description: (input.description ?? "").slice(0, 300),
      structure: input.structure ?? null,
      bagType: input.bagType ?? null,
      widthCm: input.widthCm ?? null,
      lengthCm: input.lengthCm ?? null,
      gussetCm: input.gussetCm ?? null,
      microns: input.microns ?? null,
      zipper: Boolean(input.zipper),
      valve: Boolean(input.valve),
      printed,
      quantity: qty,
      dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
      notes: input.notes?.trim() || null,
      routeName: route.name,
      createdById,
      steps: {
        create: route.phases.map((p, i) => ({
          position: i + 1,
          name: p.name,
          description: p.description ?? null,
          unit: p.unit ?? "",
          // Si la fase solo aplica a impresos y este no lo es, queda saltada desde el inicio.
          status: p.onlyIfPrinted && !printed ? "SKIPPED" : "PENDING",
          notes: p.onlyIfPrinted && !printed ? "No aplica: empaque sin impresión" : null,
        })),
      },
    },
  });

  createNotification({
    eventKey: "plant.new",
    title: "Nueva orden de producción",
    detail: `OP-${order.number} · ${order.reference} · ${qty.toLocaleString("es-CO")} und`,
    href: `/panel/planta/${order.id}`,
    createdById,
  }).catch(() => {});
  return order;
}

const orderInclude = {
  quotation: { select: { id: true, number: true, clientName: true, sellerId: true, seller: { select: { fullName: true } } } },
  steps: { orderBy: { position: "asc" as const } },
};

type OrderRow = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
async function loadOrder(id: string) {
  return prisma!.plantOrder.findUnique({ where: { id }, include: orderInclude });
}

function currentStep(steps: OrderRow["steps"]) {
  return steps.find((s) => s.status === "IN_PROGRESS") ?? steps.find((s) => s.status === "PENDING") ?? null;
}

function summarize(o: OrderRow) {
  const relevant = o.steps.filter((s) => s.status !== "SKIPPED");
  const done = relevant.filter((s) => s.status === "DONE").length;
  const cur = currentStep(o.steps);
  return {
    id: o.id,
    number: o.number,
    reference: o.reference,
    description: o.description,
    bagType: o.bagType,
    printed: o.printed,
    quantity: o.quantity,
    dueDate: o.dueDate?.toISOString() ?? null,
    status: o.status,
    stage: o.stage,
    routeName: o.routeName,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    quotation: { id: o.quotation.id, number: o.quotation.number, clientName: o.quotation.clientName, sellerName: o.quotation.seller.fullName },
    progress: { done, total: relevant.length },
    current: cur ? { name: cur.name, status: cur.status, since: (cur.startedAt ?? o.updatedAt).toISOString() } : null,
    phases: o.steps.map((st) => ({ name: st.name, status: st.status })),
  };
}

export async function listPlantOrders(user: PublicUser, opts: { quotationId?: string } = {}) {
  if (!prisma) return { orders: [], phases: [] as string[] };
  const where = { ...(await visibilityWhere(user)), ...(opts.quotationId ? { quotationId: opts.quotationId } : {}) };
  const rows = await prisma.plantOrder.findMany({ where, include: orderInclude, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 500 });
  const routes = await getRoutes();
  return { orders: rows.map(summarize), phases: routes[0]?.phases.map((p) => p.name) ?? [] };
}

export async function getPlantOrder(user: PublicUser, id: string) {
  if (!prisma) return null;
  const visible = await prisma.plantOrder.findFirst({ where: { id, ...(await visibilityWhere(user)) }, select: { id: true } });
  if (!visible) return null;
  const o = await prisma.plantOrder.findUnique({
    where: { id },
    include: {
      ...orderInclude,
      createdBy: { select: { fullName: true } },
      designRequest: { select: { id: true, number: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, mimeType: true } } } },
      steps: { orderBy: { position: "asc" }, include: { updatedBy: { select: { fullName: true } } } },
    },
  });
  if (!o) return null;
  const c = await caps(user);
  return {
    ...summarize(o),
    structure: o.structure, widthCm: o.widthCm, lengthCm: o.lengthCm, gussetCm: o.gussetCm, microns: o.microns,
    zipper: o.zipper, valve: o.valve, notes: o.notes,
    startedAt: o.startedAt?.toISOString() ?? null, finishedAt: o.finishedAt?.toISOString() ?? null,
    createdBy: o.createdBy.fullName,
    art: o.designRequest?.versions[0] ? { requestId: o.designRequest.id, ...o.designRequest.versions[0] } : null,
    steps: o.steps.map((s) => ({
      id: s.id, position: s.position, name: s.name, description: s.description, unit: s.unit, status: s.status,
      responsible: s.responsible, outputQty: s.outputQty, wasteKg: s.wasteKg, notes: s.notes,
      startedAt: s.startedAt?.toISOString() ?? null, finishedAt: s.finishedAt?.toISOString() ?? null,
      updatedBy: s.updatedBy?.fullName ?? null,
    })),
    caps: { canOperate: c.canOperate || c.admin, canManage: c.canManage },
  };
}

export type StepAction = "start" | "finish" | "skip" | "reopen";

/** Avanza una fase. Las fases van en orden: no se empieza una si la anterior no terminó. */
export async function runStepAction(
  user: PublicUser,
  stepId: string,
  action: StepAction,
  data: { responsible?: string | null; outputQty?: number | null; wasteKg?: number | null; notes?: string | null } = {},
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const c = await caps(user);
  if (!c.canOperate && !c.admin) throw new Error("FORBIDDEN");
  const step = await prisma.plantStep.findUnique({ where: { id: stepId }, include: { order: { include: { steps: { orderBy: { position: "asc" } } } } } });
  if (!step) throw new Error("NOT_FOUND");
  const order = step.order;
  if (order.status === "DONE" && action !== "reopen") throw new Error("ORDER_CLOSED");
  if (order.status === "CANCELLED") throw new Error("ORDER_CLOSED");
  const before = order.steps.filter((s) => s.position < step.position);
  const after = order.steps.filter((s) => s.position > step.position);
  const previousClosed = before.every((s) => s.status === "DONE" || s.status === "SKIPPED");
  const now = new Date();
  const num = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
  const responsible = data.responsible?.trim() || user.fullName;

  let stepData: Record<string, unknown>;
  switch (action) {
    case "start":
      if (step.status !== "PENDING") throw new Error("INVALID_TRANSITION");
      if (!previousClosed) throw new Error("PREVIOUS_OPEN");
      stepData = { status: "IN_PROGRESS", startedAt: now, responsible };
      break;
    case "finish":
      if (step.status !== "IN_PROGRESS" && step.status !== "PENDING") throw new Error("INVALID_TRANSITION");
      if (!previousClosed) throw new Error("PREVIOUS_OPEN");
      stepData = {
        status: "DONE", startedAt: step.startedAt ?? now, finishedAt: now, responsible: step.responsible ?? responsible,
        outputQty: num(data.outputQty), wasteKg: num(data.wasteKg), notes: data.notes?.trim() || null,
      };
      break;
    case "skip":
      if (step.status !== "PENDING") throw new Error("INVALID_TRANSITION");
      if (!previousClosed) throw new Error("PREVIOUS_OPEN");
      stepData = { status: "SKIPPED", finishedAt: now, notes: data.notes?.trim() || "No aplica" };
      break;
    case "reopen":
      // Para corregir un error: solo la última fase cerrada, si las siguientes no han empezado.
      if (step.status !== "DONE" && step.status !== "SKIPPED") throw new Error("INVALID_TRANSITION");
      if (after.some((s) => s.status === "DONE" || s.status === "IN_PROGRESS")) throw new Error("LATER_STARTED");
      stepData = { status: "IN_PROGRESS", finishedAt: null };
      break;
    default:
      throw new Error("INVALID_ACTION");
  }

  await prisma.$transaction(async (tx) => {
    await tx.plantStep.update({ where: { id: stepId }, data: { ...stepData, updatedById: user.id } });
    const steps = await tx.plantStep.findMany({ where: { orderId: order.id } });
    const allClosed = steps.every((s) => s.status === "DONE" || s.status === "SKIPPED");
    const anyStarted = steps.some((s) => s.status === "DONE" || s.status === "IN_PROGRESS");
    await tx.plantOrder.update({
      where: { id: order.id },
      data: {
        status: allClosed ? "DONE" : anyStarted ? "IN_PROGRESS" : "PENDING",
        startedAt: order.startedAt ?? (anyStarted ? now : null),
        finishedAt: allClosed ? now : null,
      },
    });
  });

  if (action === "finish" && after.every((s) => s.status === "SKIPPED")) {
    const q = await prisma.quotation.findUnique({ where: { id: order.quotationId }, select: { sellerId: true } });
    createNotification({
      eventKey: "plant.done",
      title: "Orden de producción terminada",
      detail: `OP-${order.number} · ${order.reference} lista para despacho`,
      href: `/panel/planta/${order.id}`,
      targetUserId: q?.sellerId ?? undefined,
      createdById: user.id,
    }).catch(() => {});
  }
}

export async function cancelPlantOrder(user: PublicUser, id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const c = await caps(user);
  if (!c.canManage) throw new Error("FORBIDDEN");
  const o = await prisma.plantOrder.findUnique({ where: { id } });
  if (!o) throw new Error("NOT_FOUND");
  if (o.status === "DONE") throw new Error("ORDER_CLOSED");
  return prisma.plantOrder.update({ where: { id }, data: { status: "CANCELLED" } });
}

export function plantErrorResponse(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  const map: Record<string, [string, number]> = {
    NOT_FOUND: ["No encontrado", 404],
    FORBIDDEN: ["No tienes permiso para esto", 403],
    INVALID_TRANSITION: ["Esa fase ya cambió; recarga la página", 409],
    PREVIOUS_OPEN: ["Primero hay que cerrar la fase anterior", 409],
    LATER_STARTED: ["Ya empezó una fase siguiente; no se puede reabrir esta", 409],
    ORDER_CLOSED: ["La orden ya está cerrada", 409],
    QUANTITY_REQUIRED: ["Indica cuántas unidades se van a producir", 400],
    NO_PHASES: ["La ruta necesita al menos una fase", 400],
    NO_ROUTE: ["No hay ruta de producción configurada", 409],
  };
  const [error, status] = map[m] ?? ["Error interno", 500];
  return Response.json({ error }, { status });
}
