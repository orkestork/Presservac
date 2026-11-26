import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_STATS_TAG } from "@/lib/cache-tags";
import { getTrmForDate } from "@/lib/trm";
import { buildSaleCalculatorSummary, sanitizeSaleCalcNumber, sanitizePct } from "@/lib/sale-calculator";
import { buildQuotationSummary, calcLineTotal, type QuotationTaxConfigInput } from "@/lib/quotation-calculator";
import { calcLineByKg } from "@/lib/bag-pricing";
import { DEFAULT_PAYMENT_TERMS, DEFAULT_VALIDITY_DAYS, DELIVERY_OPTIONS, FIRST_QUOTATION_NUMBER } from "@/lib/quotation-terms";
import {
  buildProductionSummary,
  sanitizeProductionNumber,
  type CouplingStatus,
  type CycleUnit,
  type ProductionRunInput,
  type TemperatureType,
  type TemperatureZone,
} from "@/lib/production-calculator";
import { assertProductionCanComplete } from "@/lib/production-order-policy";
import { safeUrl } from "@/lib/maintenance-upload";

// ─── ROAS helpers ───────────────────────────────────────────────

export function calcROAS(sales: number, investment: number): number {
  if (investment <= 0) return 0;
  return sales / investment;
}

export function calcCompliance(sales: number, investment: number, target = 10): number {
  if (investment <= 0) return 0;
  const roas = calcROAS(sales, investment);
  return Math.min(200, Math.round((roas / target) * 100));
}

export type CampaignStatus = "excellent" | "acceptable" | "risk" | "bad" | "pending";

export function getCampaignStatus(roas: number): CampaignStatus {
  if (roas === 0) return "pending";
  if (roas >= 10) return "excellent";
  if (roas >= 7) return "acceptable";
  if (roas >= 4) return "risk";
  return "bad";
}

export const STATUS_META: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  excellent:  { label: "Excelente",     color: "#16A34A", bg: "#DCFCE7" },
  acceptable: { label: "Aceptable",     color: "#D97706", bg: "#FEF3C7" },
  risk:       { label: "Riesgo",        color: "#EA580C", bg: "#FFEDD5" },
  bad:        { label: "Mala campaña",  color: "#DC2626", bg: "#FEE2E2" },
  pending:    { label: "Sin datos",     color: "#6B7280", bg: "#F3F4F6" },
};

// ─── DB helpers ─────────────────────────────────────────────────

async function computeDashboardStats() {
  if (!prisma) return null;

  const now = new Date();
  const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dayOfWeek    = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
  const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

  const [todayOrders, weekOrders, monthOrders, prevMonthOrders, campaignRows, products, newCustomers, recentOrders, newCustomerRows, pendingOrders, quotationsSent, lowStockProducts] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: startOfDay }, status: "PAID" }, select: { subtotal: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: startOfWeek }, status: "PAID" }, select: { subtotal: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: startOfMonth }, status: "PAID" }, select: { subtotal: true, userId: true, createdAt: true, channel: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: startOfPrevMonth, lt: startOfMonth }, status: "PAID" }, select: { subtotal: true } }),
    prisma.campaign.findMany({ include: { seller: { select: { id: true, fullName: true, avatarUrl: true } }, product: { select: { name: true, image: true } }, dailyEntries: { select: { fecha: true, presupuestoPublicidad: true, ventaDelDia: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.product.count({ where: { active: true } }),
    prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: startOfMonth } } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, customerName: true, subtotal: true, shippingStatus: true, status: true, createdAt: true },
    }),
    prisma.user.findMany({ where: { role: "CUSTOMER", createdAt: { gte: startOfMonth } }, select: { createdAt: true } }),
    prisma.order.count({ where: { shippingStatus: "PENDING", status: "PAID" } }),
    prisma.quotation.count({ where: { status: "SENT" } }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM "Product" WHERE active = true AND stock <= "minimumStock"`,
  ]);
  const lowStockCount = Number(lowStockProducts[0]?.count ?? 0);

  // Serie diaria de ventas del mes (día 1 → hoy), para el gráfico de área
  const dailyMap: Record<string, number> = {};
  for (const o of monthOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    dailyMap[key] = (dailyMap[key] ?? 0) + o.subtotal;
  }
  const dailySales: { date: string; total: number }[] = [];
  for (let d = new Date(startOfMonth); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dailySales.push({ date: key, total: dailyMap[key] ?? 0 });
  }
  const prevMonthTotal = prevMonthOrders.reduce((s, o) => s + o.subtotal, 0);

  // Serie diaria de clientes nuevos y ticket promedio del mes
  const dailyCountMap: Record<string, number> = {};
  for (const o of monthOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    dailyCountMap[key] = (dailyCountMap[key] ?? 0) + 1;
  }
  const dailyCustomerMap: Record<string, number> = {};
  for (const u of newCustomerRows) {
    const key = u.createdAt.toISOString().slice(0, 10);
    dailyCustomerMap[key] = (dailyCustomerMap[key] ?? 0) + 1;
  }
  const dailyAvgTicket: number[] = [];
  const dailyNewCustomers: number[] = [];
  for (let d = new Date(startOfMonth); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const count = dailyCountMap[key] ?? 0;
    dailyAvgTicket.push(count > 0 ? Math.round((dailyMap[key] ?? 0) / count) : 0);
    dailyNewCustomers.push(dailyCustomerMap[key] ?? 0);
  }

  // La inversión se guarda en USD y las ventas en COP: unificamos a COP con la TRM de cada campaña.
  // Las cifras reales viven en la matriz diaria (CampaignDaily); Campaign.investment/sales quedan en 0
  // cuando la campaña se alimenta día a día. Si hay matriz, manda ella (TRM del día de cada entrada).
  // Resolvemos la TRM una sola vez por fecha única (en paralelo) para no encadenar awaits.
  const trmDates = new Set<string>();
  for (const c of campaignRows) {
    if (c.dailyEntries.length === 0) trmDates.add(c.startDate.toISOString().slice(0, 10));
    else for (const e of c.dailyEntries) trmDates.add(e.fecha.toISOString().slice(0, 10));
  }
  const trmByDate = new Map<string, number>();
  await Promise.all([...trmDates].map(async (key) => {
    trmByDate.set(key, await getTrmForDate(key));
  }));
  const trmFor = (d: Date) => trmByDate.get(d.toISOString().slice(0, 10)) ?? 0;

  const campaignCop = new Map<string, number>();
  const campaigns = await Promise.all(campaignRows.map(async (c) => {
    if (c.dailyEntries.length === 0) {
      campaignCop.set(c.id, c.investment * trmFor(c.startDate));
      return c;
    }
    let investment = 0, sales = 0, cop = 0;
    for (const e of c.dailyEntries) {
      investment += e.presupuestoPublicidad;
      sales += e.ventaDelDia;
      cop += e.presupuestoPublicidad * trmFor(e.fecha);
    }
    campaignCop.set(c.id, cop);
    return { ...c, investment, sales };
  }));
  const investmentCop = (c: { id: string }) => campaignCop.get(c.id) ?? 0;

  // Serie acumulada de campañas (en orden de creación) para inversión/retorno/ROAS/riesgo
  let cumInvestment = 0;
  let cumInvestmentCop = 0;
  let cumSales = 0;
  let cumRisk = 0;
  const investmentTrend: number[] = [];
  const salesTrend: number[] = [];
  const roasTrend: number[] = [];
  const riskTrend: number[] = [];
  for (const c of campaigns) {
    cumInvestment += c.investment;
    cumInvestmentCop += investmentCop(c);
    cumSales += c.sales;
    const r = calcROAS(c.sales, investmentCop(c));
    if (r > 0 && r < 7) cumRisk += 1;
    investmentTrend.push(cumInvestment);
    salesTrend.push(cumSales);
    roasTrend.push(calcROAS(cumSales, cumInvestmentCop));
    riskTrend.push(cumRisk);
  }

  const todayTotal  = todayOrders.reduce((s, o) => s + o.subtotal, 0);
  const weekTotal   = weekOrders.reduce((s, o) => s + o.subtotal, 0);
  const monthTotal  = monthOrders.reduce((s, o) => s + o.subtotal, 0);
  const totalInvestment = campaigns.reduce((s, c) => s + c.investment, 0);
  const totalInvestmentCop = campaigns.reduce((s, c) => s + investmentCop(c), 0);
  const totalSales      = campaigns.reduce((s, c) => s + c.sales, 0);
  const roasGeneral     = calcROAS(totalSales, totalInvestmentCop);

  const atRisk = campaigns.filter((c) => {
    const r = calcROAS(c.sales, investmentCop(c));
    return r > 0 && r < 7;
  }).length;

  const CHANNEL_LABELS: Record<string, string> = {
    ONLINE: "Tienda online", WHATSAPP: "WhatsApp", MARKETPLACE: "Marketplaces", OTHER: "Otros",
  };
  const channelTotals: Record<string, number> = {};
  for (const o of monthOrders) {
    channelTotals[o.channel] = (channelTotals[o.channel] ?? 0) + o.subtotal;
  }
  const salesByChannel = Object.entries(channelTotals)
    .map(([channel, total]) => ({ channel, label: CHANNEL_LABELS[channel] ?? channel, total }))
    .sort((a, b) => b.total - a.total);

  // Top product from orders this month
  const itemCounts: Record<string, { name: string; qty: number; image: string }> = {};
  const monthOrderItems = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: startOfMonth }, status: "PAID" } },
    select: { productId: true, name: true, quantity: true, image: true },
  });
  for (const item of monthOrderItems) {
    if (!item.productId) continue;
    if (!itemCounts[item.productId]) itemCounts[item.productId] = { name: item.name, qty: 0, image: item.image };
    itemCounts[item.productId].qty += item.quantity;
  }
  const topProduct = Object.values(itemCounts).sort((a, b) => b.qty - a.qty)[0] ?? null;

  // Top seller by campaign sales
  const sellerSales: Record<string, { name: string; total: number; avatarUrl: string | null }> = {};
  for (const c of campaigns) {
    const sid = c.seller.id;
    if (!sellerSales[sid]) sellerSales[sid] = { name: c.seller.fullName, total: 0, avatarUrl: c.seller.avatarUrl };
    sellerSales[sid].total += c.sales;
  }
  const topSeller = Object.values(sellerSales).sort((a, b) => b.total - a.total)[0] ?? null;

  const uniqueCustomers = new Set(monthOrders.map((o) => o.userId)).size;
  const avgTicket = monthOrders.length > 0 ? Math.round(monthTotal / monthOrders.length) : 0;

  return {
    todayTotal,
    weekTotal,
    weekOrderCount: weekOrders.length,
    monthTotal,
    totalInvestment,
    totalSales,
    roasGeneral,
    atRisk,
    topProduct,
    topSeller,
    campaigns: campaigns.length,
    activeProducts: products,
    newCustomers,
    uniqueCustomers,
    avgTicket,
    monthOrderCount: monthOrders.length,
    dailySales,
    dailyAvgTicket,
    dailyNewCustomers,
    campaignTrends: { investment: investmentTrend, sales: salesTrend, roas: roasTrend, risk: riskTrend },
    salesByChannel,
    monthChangePercent: prevMonthTotal > 0 ? Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 1000) / 10 : null,
    pendingOrders,
    quotationsSent,
    lowStockCount,
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      subtotal: o.subtotal,
      shippingStatus: o.shippingStatus,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

// El dashboard recorre órdenes, campañas y matriz diaria del mes: cacheamos el
// resultado 60s para no recalcularlo en cada visita ni en cada router.refresh().
export const getDashboardStats = unstable_cache(
  computeDashboardStats,
  ["dashboard-stats"],
  { revalidate: 60, tags: [DASHBOARD_STATS_TAG] },
);

export async function getSellerStats() {
  if (!prisma) return [];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfWeek    = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: {
      id: true,
      fullName: true,
      email: true,
      whatsappPhone: true,
      assignedOrders: {
        where: { status: "PAID" },
        select: { subtotal: true, createdAt: true, shippingStatus: true },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return sellers.map((s) => {
    const allOrders   = s.assignedOrders;
    const weekOrders  = allOrders.filter((o) => new Date(o.createdAt) >= startOfWeek);
    const monthOrders = allOrders.filter((o) => new Date(o.createdAt) >= startOfMonth);

    return {
      id:          s.id,
      name:        s.fullName,
      email:       s.email,
      phone:       s.whatsappPhone,
      totalOrders: allOrders.length,
      weekOrders:  weekOrders.length,
      weekTotal:   weekOrders.reduce((sum, o) => sum + o.subtotal, 0),
      monthOrders: monthOrders.length,
      monthTotal:  monthOrders.reduce((sum, o) => sum + o.subtotal, 0),
      pending:     allOrders.filter((o) => o.shippingStatus === "PENDING").length,
      shipped:     allOrders.filter((o) => o.shippingStatus === "SHIPPED").length,
      delivered:   allOrders.filter((o) => o.shippingStatus === "DELIVERED").length,
    };
  });
}

export async function getProductsForPanel(sellerId?: string) {
  if (!prisma) return [];
  return prisma.product.findMany({
    include: {
      priceHistory: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: { select: { fullName: true } } },
      },
      packPrices: { orderBy: { order: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function setProductActive(productId: string, active: boolean) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.product.update({
    where: { id: productId },
    data: { active, updatedAt: new Date() },
  });
}

export async function updateProductPackPrices(
  productId: string,
  packs: { id?: string; label: string; qty: number; totalPrice: number }[],
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const db = prisma;
  await db.$transaction([
    db.productPackPrice.deleteMany({ where: { productId } }),
    ...packs.map((p, i) =>
      db.productPackPrice.create({
        data: { productId, label: p.label, qty: p.qty, totalPrice: p.totalPrice, order: i },
      }),
    ),
  ]);
}

export async function updateProductPrice(
  productId: string,
  newPrice: number,
  userId: string,
  note?: string,
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { price: true } });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { previousPrice: product.price, price: newPrice, updatedAt: new Date() } }),
    prisma.priceHistory.create({ data: { productId, oldPrice: product.price, newPrice, changedBy: userId, note: note ?? null } }),
  ]);
}

export async function getCampaignsForPanel(sellerId?: string) {
  if (!prisma) return [];
  const campaigns = await prisma.campaign.findMany({
    where: sellerId ? { sellerId } : undefined,
    include: {
      seller: { select: { id: true, fullName: true, email: true } },
      product: { select: { id: true, name: true, image: true, slug: true } },
      combo: { select: { id: true, name: true, image: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Totales de la matriz diaria (todos los días cargados) por campaña, para
  // poder mostrar el vendido real acumulado sin abrir cada matriz.
  const dailyAgg = await prisma.campaignDaily.groupBy({
    by: ["campaignId"],
    _sum: { ventaDelDia: true, presupuestoPublicidad: true, mensajes: true, transacciones: true },
    _count: { _all: true },
    _min: { fecha: true },
    _max: { fecha: true },
  });
  const dailyByCampaign = new Map(
    dailyAgg.map((d) => [
      d.campaignId,
      {
        sales: d._sum.ventaDelDia ?? 0,
        investmentUsd: d._sum.presupuestoPublicidad ?? 0,
        mensajes: d._sum.mensajes ?? 0,
        transacciones: d._sum.transacciones ?? 0,
        days: d._count._all,
        firstDate: d._min.fecha,
        lastDate: d._max.fecha,
      },
    ]),
  );

  // Filas diarias crudas, para que el panel pueda recalcular los totales
  // según el rango de fechas filtrado sin abrir la matriz de cada campaña.
  const dailyRows = await prisma.campaignDaily.findMany({
    select: { campaignId: true, fecha: true, ventaDelDia: true, presupuestoPublicidad: true, mensajes: true, transacciones: true },
  });
  const dailyRowsByCampaign = new Map<string, typeof dailyRows>();
  for (const row of dailyRows) {
    const list = dailyRowsByCampaign.get(row.campaignId) ?? [];
    list.push(row);
    dailyRowsByCampaign.set(row.campaignId, list);
  }

  // La inversión se captura en USD y las ventas en COP: adjuntamos la TRM de la fecha
  // de inicio para poder comparar ambas en pesos al calcular el KPI.
  return Promise.all(
    campaigns.map(async (c) => ({
      ...c,
      trm: await getTrmForDate(c.startDate),
      daily: dailyByCampaign.get(c.id) ?? { sales: 0, investmentUsd: 0, mensajes: 0, transacciones: 0, days: 0, firstDate: null, lastDate: null },
      dailyRows: (dailyRowsByCampaign.get(c.id) ?? []).map((r) => ({
        fecha: r.fecha.toISOString(),
        ventaDelDia: r.ventaDelDia,
        presupuestoPublicidad: r.presupuestoPublicidad,
        mensajes: r.mensajes,
        transacciones: r.transacciones,
      })),
    })),
  );
}

// ─── Matriz diaria de campaña ───────────────────────────────────

// "YYYY-MM-DD" es la fecha en calendario de Bogotá (UTC-5); la guardamos
// como las 05:00 UTC de ese día para que sea medianoche de Bogotá al leerla,
// sin depender de la zona horaria del proceso del servidor (Vercel usa UTC).
function parseCalendarDate(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T05:00:00Z` : value);
}

function sanitizeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// Log append-only del calendario comercial: cuándo se registró cada venta y quién lo hizo.
async function logSalesEvent(campaignId: string, fecha: Date, value: number, actorId?: string) {
  if (!prisma || !actorId) return;
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { sellerId: true } });
    if (!campaign) return;
    await prisma.sellerReportEvent.create({
      data: { sellerId: campaign.sellerId, date: fecha, campaignId, kind: "SALES", value, actorId },
    });
  } catch {
    // el log no debe romper el guardado de la matriz
  }
}

export async function getCampaignDailyEntries(campaignId: string) {
  if (!prisma) return [];
  const rows = await prisma.campaignDaily.findMany({
    where: { campaignId },
    orderBy: { fecha: "asc" },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      fecha: r.fecha.toISOString(),
      mensajes: r.mensajes,
      transacciones: r.transacciones,
      presupuestoPublicidad: r.presupuestoPublicidad,
      ventaDelDia: r.ventaDelDia,
      trm: await getTrmForDate(r.fecha),
    })),
  );
}

export async function createCampaignDailyEntry(
  campaignId: string,
  data: { fecha: string; mensajes?: number; transacciones?: number; presupuestoPublicidad?: number; ventaDelDia?: number },
  actorId?: string,
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const fecha = parseCalendarDate(data.fecha);
  if (Number.isNaN(fecha.getTime())) throw new Error("FECHA_INVALIDA");

  const row = await prisma.campaignDaily.create({
    data: {
      campaignId,
      fecha,
      mensajes: sanitizeNumber(data.mensajes),
      transacciones: sanitizeNumber(data.transacciones),
      presupuestoPublicidad: sanitizeNumber(data.presupuestoPublicidad),
      ventaDelDia: sanitizeNumber(data.ventaDelDia),
    },
  });

  if (row.ventaDelDia > 0) await logSalesEvent(row.campaignId, fecha, row.ventaDelDia, actorId);
  revalidateTag(DASHBOARD_STATS_TAG, "max");
  return { ...row, trm: await getTrmForDate(fecha) };
}

export async function updateCampaignDailyEntry(
  id: string,
  data: { fecha?: string; mensajes?: number; transacciones?: number; presupuestoPublicidad?: number; ventaDelDia?: number },
  actorId?: string,
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.campaignDaily.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");

  let fecha = existing.fecha;
  if (data.fecha !== undefined) {
    const parsed = parseCalendarDate(data.fecha);
    if (Number.isNaN(parsed.getTime())) throw new Error("FECHA_INVALIDA");
    fecha = parsed;
  }

  try {
    const row = await prisma.campaignDaily.update({
      where: { id },
      data: {
        fecha,
        mensajes: data.mensajes !== undefined ? sanitizeNumber(data.mensajes) : existing.mensajes,
        transacciones: data.transacciones !== undefined ? sanitizeNumber(data.transacciones) : existing.transacciones,
        presupuestoPublicidad: data.presupuestoPublicidad !== undefined ? sanitizeNumber(data.presupuestoPublicidad) : existing.presupuestoPublicidad,
        ventaDelDia: data.ventaDelDia !== undefined ? sanitizeNumber(data.ventaDelDia) : existing.ventaDelDia,
      },
    });
    if (row.ventaDelDia !== existing.ventaDelDia || row.fecha.getTime() !== existing.fecha.getTime()) {
      await logSalesEvent(row.campaignId, row.fecha, row.ventaDelDia, actorId);
    }
    revalidateTag(DASHBOARD_STATS_TAG, "max");
    return { ...row, trm: await getTrmForDate(fecha) };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) throw new Error("FECHA_DUPLICADA");
    throw err;
  }
}

export async function deleteCampaignDailyEntry(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.campaignDaily.delete({ where: { id } });
  revalidateTag(DASHBOARD_STATS_TAG, "max");
}

export async function getMetrics(sellerId?: string) {
  if (!prisma) return null;

  const now = new Date();
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString("es-CO", { month: "short" }),
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    });
  }

  const monthlyData = await Promise.all(
    months.map(async (m) => {
      const orders = await prisma!.order.findMany({
        where: { createdAt: { gte: m.start, lte: m.end }, status: { not: "CANCELLED" } },
        select: { subtotal: true },
      });
      return { label: m.label, total: orders.reduce((s, o) => s + o.subtotal, 0), count: orders.length };
    }),
  );

  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: { id: true, fullName: true, email: true, campaigns: { select: { startDate: true, sales: true, investment: true } } },
  });

  const sellerRanking = (await Promise.all(sellers.map(async (s) => {
    const totalSales = s.campaigns.reduce((sum, c) => sum + c.sales, 0);
    const totalInvestment = s.campaigns.reduce((sum, c) => sum + c.investment, 0);
    const totalInvestmentCop = (
      await Promise.all(s.campaigns.map(async (c) => c.investment * (await getTrmForDate(c.startDate))))
    ).reduce((sum, v) => sum + v, 0);
    return {
      id: s.id,
      name: s.fullName,
      email: s.email,
      totalSales,
      totalInvestment,
      roas: calcROAS(totalSales, totalInvestmentCop),
    };
  }))).sort((a, b) => b.totalSales - a.totalSales);

  return { monthlyData, sellerRanking };
}

// ─── Calculadora de precio de venta ─────────────────────────────

function toSaleCalcItemInput(item: { id: string; cantidad: number; costoUnitario: number }) {
  return { id: item.id, cantidad: item.cantidad, costoUnitario: item.costoUnitario };
}

function toSaleCalcConfig(calc: { envio: number; picking: number; comisionPct: number; margenPct: number; campanaPct: number }) {
  return { envio: calc.envio, picking: calc.picking, comisionPct: calc.comisionPct, margenPct: calc.margenPct, campanaPct: calc.campanaPct };
}

export async function getSaleCalculators(userId: string) {
  if (!prisma) return [];
  const calculators = await prisma.saleCalculator.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
  });
  return calculators.map((c) => ({
    id: c.id,
    name: c.name,
    updatedAt: c.updatedAt.toISOString(),
    summary: buildSaleCalculatorSummary(c.items.map(toSaleCalcItemInput), toSaleCalcConfig(c)),
  }));
}

export async function getSaleCalculatorWithItems(id: string) {
  if (!prisma) return null;
  const calc = await prisma.saleCalculator.findUnique({ where: { id }, include: { items: true } });
  if (!calc) return null;
  return {
    id: calc.id,
    userId: calc.userId,
    name: calc.name,
    envio: calc.envio,
    picking: calc.picking,
    comisionPct: calc.comisionPct,
    margenPct: calc.margenPct,
    campanaPct: calc.campanaPct,
    items: calc.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      costoUnitario: i.costoUnitario,
    })),
    summary: buildSaleCalculatorSummary(calc.items.map(toSaleCalcItemInput), toSaleCalcConfig(calc)),
  };
}

export async function createSaleCalculator(userId: string, name?: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.saleCalculator.create({ data: { userId, name: name?.trim() || "Nuevo combo" } });
}

export async function updateSaleCalculator(
  id: string,
  data: { name?: string; envio?: number; picking?: number; comisionPct?: number; margenPct?: number; campanaPct?: number },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.saleCalculator.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() || "Nuevo combo" } : {}),
      ...(data.envio !== undefined ? { envio: sanitizeSaleCalcNumber(data.envio) } : {}),
      ...(data.picking !== undefined ? { picking: sanitizeSaleCalcNumber(data.picking) } : {}),
      ...(data.comisionPct !== undefined ? { comisionPct: sanitizePct(data.comisionPct) } : {}),
      ...(data.margenPct !== undefined ? { margenPct: sanitizePct(data.margenPct) } : {}),
      ...(data.campanaPct !== undefined ? { campanaPct: sanitizePct(data.campanaPct) } : {}),
    },
  });
}

export async function deleteSaleCalculator(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.saleCalculator.delete({ where: { id } });
}

export async function duplicateSaleCalculator(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const original = await prisma.saleCalculator.findUnique({ where: { id }, include: { items: true } });
  if (!original) throw new Error("NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const copy = await tx.saleCalculator.create({
      data: {
        userId: original.userId,
        name: `${original.name} (copia)`,
        envio: original.envio,
        picking: original.picking,
        comisionPct: original.comisionPct,
        margenPct: original.margenPct,
        campanaPct: original.campanaPct,
      },
    });
    if (original.items.length > 0) {
      await tx.saleCalculatorItem.createMany({
        data: original.items.map((item) => ({
          calculatorId: copy.id,
          productId: item.productId,
          nombreProducto: item.nombreProducto,
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario,
        })),
      });
    }
    return copy;
  });
}

export async function createSaleCalculatorItem(
  calculatorId: string,
  data: { productId?: string | null; nombreProducto: string; cantidad?: number; costoUnitario?: number },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.saleCalculatorItem.create({
    data: {
      calculatorId,
      productId: data.productId ?? null,
      nombreProducto: data.nombreProducto.trim() || "Producto",
      cantidad: sanitizeSaleCalcNumber(data.cantidad ?? 1, { min: 1, integer: true }),
      costoUnitario: sanitizeSaleCalcNumber(data.costoUnitario ?? 0),
    },
  });
}

export async function updateSaleCalculatorItem(
  id: string,
  data: { productId?: string | null; nombreProducto?: string; cantidad?: number; costoUnitario?: number },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.saleCalculatorItem.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");

  return prisma.saleCalculatorItem.update({
    where: { id },
    data: {
      ...(data.productId !== undefined ? { productId: data.productId } : {}),
      ...(data.nombreProducto !== undefined ? { nombreProducto: data.nombreProducto.trim() || "Producto" } : {}),
      ...(data.cantidad !== undefined ? { cantidad: sanitizeSaleCalcNumber(data.cantidad, { min: 1, integer: true }) } : {}),
      ...(data.costoUnitario !== undefined ? { costoUnitario: sanitizeSaleCalcNumber(data.costoUnitario) } : {}),
    },
  });
}

export async function deleteSaleCalculatorItem(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.saleCalculatorItem.delete({ where: { id } });
}

// ─── Cotizaciones comerciales ────────────────────────────────────

function toQuotationLineInput(item: { quantity: number; unitPrice: number }) {
  return { quantity: item.quantity, unitPrice: item.unitPrice };
}

function toQuotationTaxConfig(cfg: { reteIcaPct: number; reteFuentePct: number; ivaPct: number }): QuotationTaxConfigInput {
  return { reteIcaPct: cfg.reteIcaPct, reteFuentePct: cfg.reteFuentePct, ivaPct: cfg.ivaPct };
}

function resolveQuotationItemImage(item: { manualImageUrl: string | null; product: { image: string } | null }): string {
  return item.product?.image ?? item.manualImageUrl ?? "";
}

export async function getQuotationTaxConfig() {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.quotationTaxConfig.findFirst({ where: { isActive: true } });
  if (existing) return existing;
  return prisma.quotationTaxConfig.create({ data: {} });
}

export async function updateQuotationTaxConfig(data: { reteIcaPct?: number; reteFuentePct?: number; ivaPct?: number }) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const cfg = await getQuotationTaxConfig();
  return prisma.quotationTaxConfig.update({
    where: { id: cfg.id },
    data: {
      ...(data.reteIcaPct !== undefined ? { reteIcaPct: sanitizePct(data.reteIcaPct) } : {}),
      ...(data.reteFuentePct !== undefined ? { reteFuentePct: sanitizePct(data.reteFuentePct) } : {}),
      ...(data.ivaPct !== undefined ? { ivaPct: sanitizePct(data.ivaPct) } : {}),
    },
  });
}

type QuotationTx = Parameters<Parameters<NonNullable<typeof prisma>["$transaction"]>[0]>[0];

/** Consecutivo numérico continuo (sigue el del Excel: 4823, 4824, …). */
async function generateQuotationNumber(tx: QuotationTx): Promise<string> {
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST("number" AS INTEGER)) AS max FROM "Quotation" WHERE "number" ~ '^[0-9]+$'`;
  const last = rows[0]?.max ?? null;
  return String(last && last >= FIRST_QUOTATION_NUMBER ? Number(last) + 1 : FIRST_QUOTATION_NUMBER);
}

function quotationClientName(q: { clientName: string; client: { fullName: string; company: string | null } | null }) {
  return q.clientName || q.client?.company || q.client?.fullName || "Sin cliente";
}

export async function getQuotations(session: { userId: string; role: string }) {
  if (!prisma) return [];
  const cfg = await getQuotationTaxConfig();
  const quotations = await prisma.quotation.findMany({
    where: session.role === "ADMIN" ? {} : { sellerId: session.userId },
    include: { items: true, client: { select: { fullName: true, company: true } }, seller: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return quotations.map((q) => ({
    id: q.id,
    number: q.number,
    status: q.status,
    clientName: quotationClientName(q),
    sellerName: q.seller.fullName,
    itemCount: q.items.length,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    summary: buildQuotationSummary(q.items.map(toQuotationLineInput), toQuotationTaxConfig(cfg)),
  }));
}

async function resolveExpiry<T extends { id: string; status: string; validUntil: Date | null }>(q: T): Promise<T> {
  if (!prisma) return q;
  if (q.status === "SENT" && q.validUntil && q.validUntil.getTime() < Date.now()) {
    await prisma.quotation.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
    return { ...q, status: "EXPIRED" };
  }
  return q;
}

export async function getQuotationWithItems(id: string) {
  if (!prisma) return null;
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { image: true } } }, orderBy: [{ order: "asc" }, { id: "asc" }] },
      client: true,
      seller: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!quotation) return null;
  const resolved = await resolveExpiry(quotation);
  const cfg = await getQuotationTaxConfig();

  return {
    id: resolved.id,
    number: resolved.number,
    status: resolved.status,
    sellerId: resolved.sellerId,
    seller: resolved.seller,
    clientId: resolved.clientId,
    client: resolved.client ? { id: resolved.client.id, fullName: resolved.client.fullName, company: resolved.client.company } : null,
    clientName: quotationClientName(resolved),
    clientNit: resolved.clientNit,
    clientAddress: resolved.clientAddress,
    clientCity: resolved.clientCity,
    clientContact: resolved.clientContact,
    clientEmail: resolved.clientEmail,
    clientPhone: resolved.clientPhone,
    deliveryKeys: resolved.deliveryKeys,
    printClause: resolved.printClause,
    paymentTerms: resolved.paymentTerms,
    notes: resolved.notes,
    validUntil: resolved.validUntil?.toISOString() ?? null,
    convertedOrderId: resolved.convertedOrderId,
    createdAt: resolved.createdAt.toISOString(),
    updatedAt: resolved.updatedAt.toISOString(),
    taxConfig: toQuotationTaxConfig(cfg),
    items: quotation.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      reference: i.reference,
      imageUrl: resolveQuotationItemImage(i),
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      order: i.order,
      structure: i.structure,
      bagType: i.bagType,
      widthCm: i.widthCm,
      lengthCm: i.lengthCm,
      microns: i.microns,
      gussetCm: i.gussetCm,
      zipper: i.zipper,
      valve: i.valve,
      unit: i.unit,
      kilos: i.kilos,
      pricePerKg: i.pricePerKg,
      wastePct: i.wastePct,
      zipperPerCm: i.zipperPerCm,
    })),
    summary: buildQuotationSummary(quotation.items.map(toQuotationLineInput), toQuotationTaxConfig(cfg)),
  };
}

export type QuotationClientInput = {
  clientId?: string | null;
  clientName?: string;
  clientNit?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientContact?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
};

const trimOrNull = (v: string | null | undefined) => (v == null ? null : v.trim() || null);

function clientData(data: QuotationClientInput) {
  return {
    ...(data.clientId !== undefined ? { clientId: data.clientId || null } : {}),
    ...(data.clientName !== undefined ? { clientName: data.clientName.trim() } : {}),
    ...(data.clientNit !== undefined ? { clientNit: trimOrNull(data.clientNit) } : {}),
    ...(data.clientAddress !== undefined ? { clientAddress: trimOrNull(data.clientAddress) } : {}),
    ...(data.clientCity !== undefined ? { clientCity: trimOrNull(data.clientCity) } : {}),
    ...(data.clientContact !== undefined ? { clientContact: trimOrNull(data.clientContact) } : {}),
    ...(data.clientEmail !== undefined ? { clientEmail: trimOrNull(data.clientEmail) } : {}),
    ...(data.clientPhone !== undefined ? { clientPhone: trimOrNull(data.clientPhone) } : {}),
  };
}

/** Datos del cliente registrado para precargar la cotización. */
async function clientSnapshot(clientId: string): Promise<QuotationClientInput> {
  if (!prisma) return {};
  const u = await prisma.user.findUnique({ where: { id: clientId } });
  if (!u) throw new Error("CLIENT_NOT_FOUND");
  return {
    clientId: u.id,
    clientName: u.company || u.fullName,
    clientAddress: u.addressLine1,
    clientCity: u.city,
    clientContact: u.fullName,
    clientEmail: u.email,
    clientPhone: u.phone,
  };
}

export async function createQuotation(sellerId: string, input: QuotationClientInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const fromUser = input.clientId ? await clientSnapshot(input.clientId) : {};
  const merged = { ...fromUser, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")) };
  if (!merged.clientName?.trim()) throw new Error("CLIENT_REQUIRED");
  const validUntil = new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const number = await generateQuotationNumber(tx);
    return tx.quotation.create({
      data: { number, sellerId, paymentTerms: DEFAULT_PAYMENT_TERMS, validUntil, ...clientData(merged) },
    });
  });
}

async function assertDraft(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await prisma.quotation.findUnique({ where: { id } });
  if (!q) throw new Error("NOT_FOUND");
  if (q.status !== "DRAFT") throw new Error("NOT_EDITABLE");
  return q;
}

export async function updateQuotation(
  id: string,
  data: QuotationClientInput & {
    paymentTerms?: string | null; notes?: string | null; validUntil?: string | null;
    deliveryKeys?: string[]; printClause?: boolean;
  },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertDraft(id);
  // Al elegir un cliente registrado se copian sus datos; lo que venga escrito manda.
  const fromUser = data.clientId ? await clientSnapshot(data.clientId) : {};
  const validKeys = new Set(DELIVERY_OPTIONS.map((o) => o.key));
  return prisma.quotation.update({
    where: { id },
    data: {
      ...clientData({ ...fromUser, ...data }),
      ...(data.paymentTerms !== undefined ? { paymentTerms: data.paymentTerms } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.validUntil !== undefined ? { validUntil: data.validUntil ? new Date(data.validUntil) : null } : {}),
      ...(data.deliveryKeys !== undefined ? { deliveryKeys: data.deliveryKeys.filter((k) => validKeys.has(k)) } : {}),
      ...(data.printClause !== undefined ? { printClause: Boolean(data.printClause) } : {}),
    },
  });
}

export async function deleteQuotation(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertDraft(id);
  await prisma.quotation.delete({ where: { id } });
}

export type QuotationItemInput = {
  productId?: string | null; name?: string; reference?: string | null; manualImageUrl?: string | null;
  quantity?: number; unitPrice?: number;
  structure?: string | null; bagType?: string | null;
  widthCm?: number | null; lengthCm?: number | null; microns?: number | null; gussetCm?: number | null;
  zipper?: boolean; valve?: boolean; unit?: string;
  kilos?: number | null; pricePerKg?: number | null; wastePct?: number | null; zipperPerCm?: number | null;
};

const STRUCTURES = new Set(["PAPE", "LAMINADO"]);
const BAG_TYPES = new Set(["COJIN", "DOYPACK", "FLOWPACK"]);
const optNum = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));

function technicalData(d: QuotationItemInput) {
  return {
    ...(d.structure !== undefined ? { structure: d.structure && STRUCTURES.has(d.structure) ? d.structure : null } : {}),
    ...(d.bagType !== undefined ? { bagType: d.bagType && BAG_TYPES.has(d.bagType) ? d.bagType : null } : {}),
    ...(d.widthCm !== undefined ? { widthCm: optNum(d.widthCm) } : {}),
    ...(d.lengthCm !== undefined ? { lengthCm: optNum(d.lengthCm) } : {}),
    ...(d.microns !== undefined ? { microns: optNum(d.microns) === null ? null : Math.round(Number(d.microns)) } : {}),
    ...(d.gussetCm !== undefined ? { gussetCm: optNum(d.gussetCm) } : {}),
    ...(d.zipper !== undefined ? { zipper: Boolean(d.zipper) } : {}),
    ...(d.valve !== undefined ? { valve: Boolean(d.valve) } : {}),
    ...(d.unit !== undefined ? { unit: (d.unit || "UND").trim().toUpperCase().slice(0, 10) } : {}),
    ...(d.kilos !== undefined ? { kilos: optNum(d.kilos) } : {}),
    ...(d.pricePerKg !== undefined ? { pricePerKg: optNum(d.pricePerKg) === null ? null : Math.round(Number(d.pricePerKg)) } : {}),
    ...(d.wastePct !== undefined ? { wastePct: d.wastePct == null ? null : Math.min(99, Math.max(0, Number(d.wastePct) || 0)) } : {}),
    ...(d.zipperPerCm !== undefined ? { zipperPerCm: d.zipperPerCm == null ? null : Math.max(0, Number(d.zipperPerCm) || 0) } : {}),
  };
}

/** Si la línea se cotiza por kilo, el valor unitario sale de la fórmula de la hoja. */
function priceFromKg(merged: Parameters<typeof calcLineByKg>[0]): number | undefined {
  const calc = calcLineByKg(merged);
  return calc ? calc.unitPrice : undefined;
}

export async function createQuotationItem(quotationId: string, data: QuotationItemInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertDraft(quotationId);

  let name = data.name?.trim() ?? "";
  let unitPrice = data.unitPrice;
  if (data.productId) {
    const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { name: true, price: true } });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    name = product.name;
    unitPrice = product.price;
  }
  if (!name) throw new Error("NAME_REQUIRED");
  const tech = technicalData(data);
  unitPrice = priceFromKg(tech) ?? unitPrice;
  const last = await prisma.quotationItem.aggregate({ where: { quotationId }, _max: { order: true } });

  return prisma.quotationItem.create({
    data: {
      quotationId,
      productId: data.productId ?? null,
      name,
      reference: data.reference ?? null,
      manualImageUrl: data.productId ? null : (data.manualImageUrl ?? null),
      quantity: sanitizeSaleCalcNumber(data.quantity ?? 1, { min: 1, integer: true }),
      unitPrice: Math.round(sanitizeSaleCalcNumber(unitPrice ?? 0)),
      order: (last._max.order ?? -1) + 1,
      ...tech,
    },
  });
}

export async function updateQuotationItem(id: string, data: QuotationItemInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.quotationItem.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  await assertDraft(existing.quotationId);

  let name = data.name;
  let unitPrice = data.unitPrice;
  let manualImageUrl = data.manualImageUrl;
  if (data.productId !== undefined) {
    if (data.productId) {
      const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { name: true, price: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      name = product.name;
      unitPrice = product.price;
      manualImageUrl = null;
    }
  }
  const tech = technicalData(data);
  const fromKg = priceFromKg({ ...existing, ...tech });
  if (fromKg !== undefined) unitPrice = fromKg;

  return prisma.quotationItem.update({
    where: { id },
    data: {
      ...(data.productId !== undefined ? { productId: data.productId } : {}),
      ...(name !== undefined ? { name: name.trim() || existing.name } : {}),
      ...(data.reference !== undefined ? { reference: data.reference } : {}),
      ...((data.productId === undefined ? !existing.productId : !data.productId) && manualImageUrl !== undefined ? { manualImageUrl } : {}),
      ...(data.quantity !== undefined ? { quantity: sanitizeSaleCalcNumber(data.quantity, { min: 1, integer: true }) } : {}),
      ...(unitPrice !== undefined ? { unitPrice: Math.round(sanitizeSaleCalcNumber(unitPrice)) } : {}),
      ...tech,
    },
  });
}

export type QuotationFullInput = QuotationClientInput & {
  paymentTerms?: string | null;
  notes?: string | null;
  validUntil?: string | null;
  deliveryKeys?: string[];
  printClause?: boolean;
  items: QuotationItemInput[];
};

/** Guarda la cotización completa de una vez (pantalla de cotizar): crea o reemplaza el borrador. */
export async function saveQuotationFull(sellerId: string, id: string | null, data: QuotationFullInput) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!data.clientName?.trim()) throw new Error("CLIENT_REQUIRED");
  if (data.clientId) {
    const exists = await prisma.user.findUnique({ where: { id: data.clientId }, select: { id: true } });
    if (!exists) throw new Error("CLIENT_NOT_FOUND");
  }
  if (id) await assertDraft(id);
  const validKeys = new Set(DELIVERY_OPTIONS.map((o) => o.key));
  const items = (Array.isArray(data.items) ? data.items : []).slice(0, 100).map((it, order) => ({
    name: (it.name ?? "").trim() || "Ítem",
    reference: trimOrNull(it.reference ?? null),
    quantity: sanitizeSaleCalcNumber(it.quantity ?? 1, { min: 1, integer: true }),
    unitPrice: Math.round(sanitizeSaleCalcNumber(it.unitPrice ?? 0)),
    order,
    ...technicalData({
      structure: it.structure ?? null, bagType: it.bagType ?? null,
      widthCm: it.widthCm ?? null, lengthCm: it.lengthCm ?? null, microns: it.microns ?? null, gussetCm: it.gussetCm ?? null,
      zipper: Boolean(it.zipper), valve: Boolean(it.valve), unit: it.unit ?? "UND",
      kilos: it.kilos ?? null, pricePerKg: it.pricePerKg ?? null, wastePct: it.wastePct ?? null, zipperPerCm: it.zipperPerCm ?? null,
    }),
  }));
  const fields = {
    ...clientData({ ...data, clientId: data.clientId ?? null }),
    paymentTerms: trimOrNull(data.paymentTerms ?? null) ?? DEFAULT_PAYMENT_TERMS,
    notes: trimOrNull(data.notes ?? null),
    validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86_400_000),
    deliveryKeys: (data.deliveryKeys ?? []).filter((k) => validKeys.has(k)),
    printClause: Boolean(data.printClause),
  };

  return prisma.$transaction(async (tx) => {
    if (id) {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      return tx.quotation.update({ where: { id }, data: { ...fields, items: { create: items } } });
    }
    const number = await generateQuotationNumber(tx);
    return tx.quotation.create({ data: { number, sellerId, ...fields, items: { create: items } } });
  });
}

export async function deleteQuotationItem(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.quotationItem.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  await assertDraft(existing.quotationId);
  await prisma.quotationItem.delete({ where: { id } });
}

export async function sendQuotation(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!q) throw new Error("NOT_FOUND");
  if (q.status !== "DRAFT") throw new Error("INVALID_TRANSITION");
  if (q.items.length === 0) throw new Error("NO_ITEMS");
  const updated = await prisma.quotation.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  revalidateTag(DASHBOARD_STATS_TAG, "max");
  return updated;
}

export async function approveQuotation(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await resolveExpiry(await requireQuotation(id));
  if (q.status !== "SENT") throw new Error("INVALID_TRANSITION");
  return prisma.quotation.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
}

export async function rejectQuotation(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await resolveExpiry(await requireQuotation(id));
  if (q.status !== "SENT") throw new Error("INVALID_TRANSITION");
  return prisma.quotation.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date() } });
}

async function requireQuotation(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const q = await prisma.quotation.findUnique({ where: { id } });
  if (!q) throw new Error("NOT_FOUND");
  return q;
}

export async function convertQuotationToOrder(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { items: { include: { product: { select: { image: true } } } }, client: true },
  });
  if (!quotation) throw new Error("NOT_FOUND");
  if (quotation.status !== "APPROVED") throw new Error("INVALID_TRANSITION");
  if (quotation.convertedOrderId) throw new Error("ALREADY_CONVERTED");
  if (!quotation.clientId || !quotation.client) throw new Error("CLIENT_REQUIRED");
  const client = quotation.client;
  const clientId = quotation.clientId;

  const subtotal = calcLineTotalSum(quotation.items);
  const totalItems = quotation.items.reduce((sum, i) => sum + i.quantity, 0);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: clientId,
        customerName: client.fullName,
        customerEmail: client.email,
        customerPhone: client.phone ?? "",
        company: client.company,
        department: client.department ?? "",
        city: client.city ?? "",
        addressLine1: client.addressLine1 ?? "",
        addressLine2: client.addressLine2,
        subtotal,
        totalItems,
        channel: "OTHER",
        assignedSellerId: quotation.sellerId,
        items: {
          create: quotation.items.map((i) => ({
            productId: i.productId ?? "",
            name: i.name,
            image: resolveQuotationItemImage(i),
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: calcLineTotal(toQuotationLineInput(i)),
          })),
        },
      },
    });
    await tx.quotation.update({ where: { id }, data: { convertedOrderId: order.id } });
    return order;
  });
}

function calcLineTotalSum(items: { quantity: number; unitPrice: number }[]): number {
  return items.reduce((sum, i) => sum + calcLineTotal(toQuotationLineInput(i)), 0);
}

// ─── Producción ──────────────────────────────────────────────────

function toProductionRunInput(run: { produced: number; damaged: number; nonConforming: number }): ProductionRunInput {
  return { produced: run.produced, damaged: run.damaged, nonConforming: run.nonConforming };
}

export async function getMachines(includeInactive = false) {
  if (!prisma) return [];
  return prisma.machine.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { code: "asc" },
  });
}

export async function createMachine(data: { code: number; name: string; brand: string; model?: string; location?: string }) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.machine.create({
    data: {
      code: data.code,
      name: data.name.trim(),
      brand: data.brand.trim(),
      model: data.model?.trim() || null,
      location: data.location?.trim() || null,
    },
  });
}

export async function updateMachine(
  id: string,
  data: { code?: number; name?: string; brand?: string; model?: string | null; location?: string | null; isActive?: boolean },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.machine.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.brand !== undefined ? { brand: data.brand.trim() } : {}),
      ...(data.model !== undefined ? { model: data.model?.trim() || null } : {}),
      ...(data.location !== undefined ? { location: data.location?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export async function deleteMachine(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.machine.delete({ where: { id } });
}

export async function getProductionRuns(filters?: { machineId?: string; operatorId?: string; from?: Date; to?: Date }) {
  if (!prisma) return [];
  const runs = await prisma.productionRun.findMany({
    where: {
      ...(filters?.machineId ? { machineId: filters.machineId } : {}),
      ...(filters?.operatorId ? { operatorId: filters.operatorId } : {}),
      ...(filters?.from || filters?.to
        ? { productionDate: { ...(filters?.from ? { gte: filters.from } : {}), ...(filters?.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    include: {
      machine: { select: { id: true, name: true, brand: true, code: true } },
      operator: { select: { id: true, fullName: true } },
      product: { select: { id: true, name: true, sku: true } },
    },
    orderBy: [{ productionDate: "desc" }, { startTime: "desc" }],
    take: 500,
  });
  return runs.map((r) => ({ ...r, summary: buildProductionSummary(toProductionRunInput(r)) }));
}

export async function getProductionRunById(id: string) {
  if (!prisma) return null;
  const run = await prisma.productionRun.findUnique({
    where: { id },
    include: {
      machine: { select: { id: true, name: true, brand: true, code: true } },
      operator: { select: { id: true, fullName: true } },
      product: { select: { id: true, name: true, sku: true } },
    },
  });
  if (!run) return null;
  return { ...run, summary: buildProductionSummary(toProductionRunInput(run)) };
}

export type ProductionRunWriteData = {
  machineId: string;
  operatorId: string;
  productId?: string | null;
  productionOrderId?: string | null;
  orderNumber: string;
  productionDate: Date;
  startTime: Date;
  endTime: Date;
  material: string;
  pigment?: string | null;
  pigmentQuantity?: number | null;
  pigmentColor?: string | null;
  injectionWeight: number;
  pieceWeight: number;
  cycle: number;
  cycleUnit?: CycleUnit;
  cavities?: number;
  temperature: number;
  temperatureType?: TemperatureType;
  temperatureZones?: TemperatureZone[] | null;
  manualProductName?: string | null;
  produced: number;
  damaged?: number;
  nonConforming?: number;
  couplingTest?: string | null;
  couplingStatus?: CouplingStatus | null;
  couplingTime?: string | null;
  couplingPhotoUrl?: string | null;
  observations?: string | null;
  downtimeMinutes?: number;
  materialQuantityKg?: number | null;
};

const ZONE_LABELS = ["A", "B", "C", "D", "E", "F"];

export function normalizeTemperatureZones(input: unknown): TemperatureZone[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const value = Number((raw as { value?: unknown }).value);
      if (!Number.isFinite(value) || value < 0) return null;
      const labelRaw = (raw as { label?: unknown }).label;
      const label =
        typeof labelRaw === "string" && labelRaw.trim()
          ? labelRaw.trim().toUpperCase().slice(0, 3)
          : ZONE_LABELS[index] ?? String(index + 1);
      return { label, value: sanitizeProductionNumber(value, { min: 0 }) };
    })
    .filter((z): z is TemperatureZone => z !== null)
    .slice(0, ZONE_LABELS.length);
}

function assertProductionQuantities(produced: number, damaged: number, nonConforming: number) {
  if (damaged > produced) throw new Error("DAMAGED_EXCEEDS_PRODUCED");
  if (nonConforming > produced) throw new Error("NON_CONFORMING_EXCEEDS_PRODUCED");
  if (damaged + nonConforming > produced) throw new Error("DEFECTIVE_EXCEEDS_PRODUCED");
}

export async function createProductionRun(data: ProductionRunWriteData) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  assertProductionQuantities(data.produced, data.damaged ?? 0, data.nonConforming ?? 0);
  return prisma.productionRun.create({
    data: {
      machineId: data.machineId,
      operatorId: data.operatorId,
      productId: data.productId ?? null,
      productionOrderId: data.productionOrderId ?? null,
      orderNumber: data.orderNumber.trim(),
      productionDate: data.productionDate,
      startTime: data.startTime,
      endTime: data.endTime,
      material: data.material.trim(),
      pigment: data.pigment?.trim() || null,
      pigmentQuantity: data.pigmentQuantity != null ? sanitizeProductionNumber(data.pigmentQuantity, { min: 0 }) : null,
      pigmentColor: data.pigmentColor?.trim() || null,
      injectionWeight: sanitizeProductionNumber(data.injectionWeight, { min: 0 }),
      pieceWeight: sanitizeProductionNumber(data.pieceWeight, { min: 0 }),
      cycle: sanitizeProductionNumber(data.cycle, { min: 0 }),
      cycleUnit: data.cycleUnit ?? "seconds",
      cavities: data.cavities ? sanitizeProductionNumber(data.cavities, { min: 1, max: 500, integer: true }) : 1,
      temperature: sanitizeProductionNumber(data.temperature, { min: 0 }),
      temperatureType: data.temperatureType ?? "simple",
      temperatureZones: normalizeTemperatureZones(data.temperatureZones),
      manualProductName: data.manualProductName?.trim() || null,
      produced: sanitizeProductionNumber(data.produced, { min: 0, integer: true }),
      damaged: sanitizeProductionNumber(data.damaged ?? 0, { min: 0, integer: true }),
      nonConforming: sanitizeProductionNumber(data.nonConforming ?? 0, { min: 0, integer: true }),
      couplingTest: data.couplingTest?.trim() || null,
      couplingStatus: data.couplingStatus ?? null,
      couplingTime: data.couplingTime?.trim() || null,
      couplingPhotoUrl: safeUrl(data.couplingPhotoUrl),
      observations: data.observations?.trim() || null,
      downtimeMinutes: sanitizeProductionNumber(data.downtimeMinutes ?? 0, { min: 0, integer: true }),
      materialQuantityKg: data.materialQuantityKg != null ? sanitizeProductionNumber(data.materialQuantityKg, { min: 0 }) : null,
    },
  });
}

export async function updateProductionRun(id: string, data: Partial<ProductionRunWriteData>) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  if (data.produced !== undefined || data.damaged !== undefined || data.nonConforming !== undefined) {
    const existing = await prisma.productionRun.findUnique({ where: { id } });
    if (!existing) throw new Error("NOT_FOUND");
    assertProductionQuantities(
      data.produced ?? existing.produced,
      data.damaged ?? existing.damaged,
      data.nonConforming ?? existing.nonConforming,
    );
  }
  return prisma.productionRun.update({
    where: { id },
    data: {
      ...(data.machineId !== undefined ? { machineId: data.machineId } : {}),
      ...(data.operatorId !== undefined ? { operatorId: data.operatorId } : {}),
      ...(data.productId !== undefined ? { productId: data.productId } : {}),
      ...(data.productionOrderId !== undefined ? { productionOrderId: data.productionOrderId } : {}),
      ...(data.orderNumber !== undefined ? { orderNumber: data.orderNumber.trim() } : {}),
      ...(data.productionDate !== undefined ? { productionDate: data.productionDate } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
      ...(data.material !== undefined ? { material: data.material.trim() } : {}),
      ...(data.pigment !== undefined ? { pigment: data.pigment?.trim() || null } : {}),
      ...(data.pigmentQuantity !== undefined ? { pigmentQuantity: data.pigmentQuantity != null ? sanitizeProductionNumber(data.pigmentQuantity, { min: 0 }) : null } : {}),
      ...(data.pigmentColor !== undefined ? { pigmentColor: data.pigmentColor?.trim() || null } : {}),
      ...(data.injectionWeight !== undefined ? { injectionWeight: sanitizeProductionNumber(data.injectionWeight, { min: 0 }) } : {}),
      ...(data.pieceWeight !== undefined ? { pieceWeight: sanitizeProductionNumber(data.pieceWeight, { min: 0 }) } : {}),
      ...(data.cycle !== undefined ? { cycle: sanitizeProductionNumber(data.cycle, { min: 0 }) } : {}),
      ...(data.cycleUnit !== undefined ? { cycleUnit: data.cycleUnit } : {}),
      ...(data.cavities !== undefined ? { cavities: sanitizeProductionNumber(data.cavities, { min: 1, max: 500, integer: true }) } : {}),
      ...(data.temperature !== undefined ? { temperature: sanitizeProductionNumber(data.temperature, { min: 0 }) } : {}),
      ...(data.temperatureType !== undefined ? { temperatureType: data.temperatureType } : {}),
      ...(data.temperatureZones !== undefined ? { temperatureZones: normalizeTemperatureZones(data.temperatureZones) } : {}),
      ...(data.manualProductName !== undefined ? { manualProductName: data.manualProductName?.trim() || null } : {}),
      ...(data.produced !== undefined ? { produced: sanitizeProductionNumber(data.produced, { min: 0, integer: true }) } : {}),
      ...(data.damaged !== undefined ? { damaged: sanitizeProductionNumber(data.damaged, { min: 0, integer: true }) } : {}),
      ...(data.nonConforming !== undefined ? { nonConforming: sanitizeProductionNumber(data.nonConforming, { min: 0, integer: true }) } : {}),
      ...(data.couplingTest !== undefined ? { couplingTest: data.couplingTest?.trim() || null } : {}),
      ...(data.couplingStatus !== undefined ? { couplingStatus: data.couplingStatus } : {}),
      ...(data.couplingTime !== undefined ? { couplingTime: data.couplingTime?.trim() || null } : {}),
      ...(data.couplingPhotoUrl !== undefined ? { couplingPhotoUrl: safeUrl(data.couplingPhotoUrl) } : {}),
      ...(data.observations !== undefined ? { observations: data.observations?.trim() || null } : {}),
      ...(data.downtimeMinutes !== undefined ? { downtimeMinutes: sanitizeProductionNumber(data.downtimeMinutes, { min: 0, integer: true }) } : {}),
      ...(data.materialQuantityKg !== undefined ? { materialQuantityKg: data.materialQuantityKg != null ? sanitizeProductionNumber(data.materialQuantityKg, { min: 0 }) : null } : {}),
    },
  });
}

export async function deleteProductionRun(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await prisma.productionRun.delete({ where: { id } });
}

// ─── Órdenes de Producción ───────────────────────────────────────

export type ProductionOrderSummary = {
  totalReferences: number;
  totalUnits: number;
  status: string;
};

function buildProductionOrderSummary(items: { quantity: number }[], status: string): ProductionOrderSummary {
  return {
    totalReferences: items.length,
    totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    status,
  };
}

type ProductionOrderTx = Parameters<Parameters<NonNullable<typeof prisma>["$transaction"]>[0]>[0];

async function generateProductionOrderNumber(tx: ProductionOrderTx): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OP-${year}-`;
  const last = await tx.productionOrder.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastSeq = last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, "0")}`;
}

export async function getProductionOrders(filters?: { status?: string; area?: string }) {
  if (!prisma) return [];
  const orders = await prisma.productionOrder.findMany({
    where: {
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.area ? { area: filters.area as never } : {}),
    },
    include: { items: true, createdBy: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    area: o.area,
    productionDate: o.productionDate.toISOString(),
    createdByName: o.createdBy.fullName,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    summary: buildProductionOrderSummary(o.items, o.status),
  }));
}

export async function getProductionOrderWithItems(id: string) {
  if (!prisma) return null;
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true, image: true } } }, orderBy: { order: "asc" } },
      createdBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    area: order.area,
    productionDate: order.productionDate.toISOString(),
    notes: order.notes,
    createdById: order.createdById,
    createdBy: order.createdBy,
    approvedById: order.approvedById,
    approvedBy: order.approvedBy,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      product: i.product,
      quantity: i.quantity,
      destination: i.destination,
      notes: i.notes,
      order: i.order,
    })),
    summary: buildProductionOrderSummary(order.items, order.status),
  };
}

export async function createProductionOrder(data: { createdById: string; productionDate: Date; notes?: string | null; area?: "INYECCION" | "ENSAMBLE" }) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const number = await generateProductionOrderNumber(tx);
        return tx.productionOrder.create({
          data: {
            number,
            createdById: data.createdById,
            productionDate: data.productionDate,
            area: data.area ?? "INYECCION",
            notes: data.notes ?? null,
          },
        });
      });
    } catch (err) {
      const isUniqueClash = typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
      if (!isUniqueClash || attempt === 2) throw err;
    }
  }
  throw new Error("PRODUCTION_ORDER_NUMBER_CONFLICT");
}

async function assertProductionOrderDraft(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const o = await prisma.productionOrder.findUnique({ where: { id } });
  if (!o) throw new Error("NOT_FOUND");
  if (o.status !== "DRAFT") throw new Error("NOT_EDITABLE");
  return o;
}

export async function updateProductionOrder(
  id: string,
  data: { productionDate?: Date; notes?: string | null; area?: "INYECCION" | "ENSAMBLE" },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertProductionOrderDraft(id);
  return prisma.productionOrder.update({
    where: { id },
    data: {
      ...(data.area !== undefined ? { area: data.area } : {}),
      ...(data.productionDate !== undefined ? { productionDate: data.productionDate } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });
}

export async function deleteProductionOrder(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertProductionOrderDraft(id);
  await prisma.productionOrder.delete({ where: { id } });
}

export async function createProductionOrderItem(
  productionOrderId: string,
  data: { productId: string; quantity?: number; destination?: string | null; notes?: string | null },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  await assertProductionOrderDraft(productionOrderId);

  const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true } });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  return prisma.productionOrderItem.create({
    data: {
      productionOrderId,
      productId: data.productId,
      quantity: sanitizeProductionNumber(data.quantity ?? 1, { min: 1, integer: true }),
      destination: data.destination?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export async function updateProductionOrderItem(
  id: string,
  data: { productId?: string; quantity?: number; destination?: string | null; notes?: string | null },
) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.productionOrderItem.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  await assertProductionOrderDraft(existing.productionOrderId);

  if (data.productId !== undefined) {
    const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true } });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
  }

  return prisma.productionOrderItem.update({
    where: { id },
    data: {
      ...(data.productId !== undefined ? { productId: data.productId } : {}),
      ...(data.quantity !== undefined ? { quantity: sanitizeProductionNumber(data.quantity, { min: 1, integer: true }) } : {}),
      ...(data.destination !== undefined ? { destination: data.destination?.trim() || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    },
  });
}

export async function deleteProductionOrderItem(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await prisma.productionOrderItem.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  await assertProductionOrderDraft(existing.productionOrderId);
  await prisma.productionOrderItem.delete({ where: { id } });
}

export async function approveProductionOrder(id: string, approvedById: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({ where: { id }, include: { items: { select: { id: true } } } });
    if (!order) throw new Error("NOT_FOUND");
    if (order.items.length === 0) throw new Error("NO_ITEMS");
    const changed = await tx.productionOrder.updateMany({ where: { id, status: "DRAFT" }, data: { status: "APPROVED", approvedById, approvedAt: new Date() } });
    if (changed.count !== 1) throw new Error("INVALID_TRANSITION");
    return tx.productionOrder.findUniqueOrThrow({ where: { id } });
  });
}

export async function startProductionOrder(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const exists = await prisma.productionOrder.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new Error("NOT_FOUND");
  const changed = await prisma.productionOrder.updateMany({ where: { id, status: "APPROVED" }, data: { status: "IN_PRODUCTION" } });
  if (changed.count !== 1) throw new Error("INVALID_TRANSITION");
  return prisma.productionOrder.findUniqueOrThrow({ where: { id } });
}

export async function completeProductionOrder(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({ where: { id }, include: { items: { select: { quantity: true } }, runs: { select: { produced: true, damaged: true, nonConforming: true } } } });
    if (!order) throw new Error("NOT_FOUND");
    if (order.status !== "IN_PRODUCTION") throw new Error("INVALID_TRANSITION");
    assertProductionCanComplete(order.items.reduce((total, item) => total + item.quantity, 0), order.runs);
    const changed = await tx.productionOrder.updateMany({ where: { id, status: "IN_PRODUCTION" }, data: { status: "COMPLETED" } });
    if (changed.count !== 1) throw new Error("INVALID_TRANSITION");
    return tx.productionOrder.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelProductionOrder(id: string) {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const exists = await prisma.productionOrder.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new Error("NOT_FOUND");
  const changed = await prisma.productionOrder.updateMany({ where: { id, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED" } });
  if (changed.count !== 1) throw new Error("INVALID_TRANSITION");
  return prisma.productionOrder.findUniqueOrThrow({ where: { id } });
}
