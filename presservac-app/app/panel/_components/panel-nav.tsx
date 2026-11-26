"use client";

import { createContext, useContext } from "react";
import {
  MdDashboard, MdInventory2, MdCategory, MdBarChart, MdCampaign, MdAttachMoney, MdSettings,
  MdCalculate, MdDescription, MdPrecisionManufacturing, MdAssignment, MdPeople, MdImage, MdVerified,
  MdCardGiftcard, MdLocalOffer, MdWork, MdHome, MdSearch, MdNotificationsNone, MdPersonOutline,
  MdApartment, MdAccessTime, MdBeachAccess, MdRemoveCircleOutline, MdSwapHoriz, MdHandshake,
  MdCreditCard, MdHelpOutline, MdGroup, MdWarehouse, MdArticle, MdSmartToy, MdShoppingCart,
  MdInventory, MdExtension, MdConfirmationNumber, MdChat, MdVideocam, MdFolder,
  MdLocalShipping, MdBuild, MdCalendarMonth, MdChecklist, MdPalette, MdPublic, MdHistory,
} from "react-icons/md";

export type NavChild = {
  href: string;
  label: string;
  module: string;
  /** Visible si el usuario ve cualquiera de estos módulos (para vistas transversales). */
  anyModule?: string[];
  group?: string;
  groupIcon?: React.ReactNode;
  icon?: React.ReactNode;
  superAdminOnly?: boolean;
};

export type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  module?: string;
  children?: NavChild[];
};

export const NAV: NavItem[] = [
  { key: "inicio", href: "/panel", label: "Inicio", icon: <MdDashboard size={18} />, module: "MODULE_DASHBOARD" },
  {
    key: "tareas",
    href: "/panel/tareas",
    label: "Tareas",
    icon: <MdChecklist size={18} />,
    module: "MODULE_TAREAS",
  },
  {
    key: "comercial",
    href: "/panel/pedidos",
    label: "Comercial",
    icon: <MdShoppingCart size={18} />,
    children: [
      { href: "/panel/pedidos", label: "Pedidos", module: "MODULE_PEDIDOS", group: "Ventas", groupIcon: <MdInventory2 size={14} />, icon: <MdInventory2 size={17} /> },
      { href: "/panel/whatsapp", label: "WhatsApp", module: "MODULE_WHATSAPP", icon: <MdChat size={17} /> },
      { href: "/panel/cotizaciones", label: "Cotizaciones", module: "MODULE_COTIZACIONES", icon: <MdDescription size={17} /> },
      { href: "/panel/campanas", label: "Campañas", module: "MODULE_CAMPANAS", group: "Marketing", groupIcon: <MdCampaign size={14} />, icon: <MdCampaign size={17} /> },
      { href: "/panel/calendario", label: "Calendario", module: "MODULE_CAMPANAS", icon: <MdCalendarMonth size={17} /> },
      { href: "/panel/metricas", label: "Métricas", module: "MODULE_METRICAS", icon: <MdBarChart size={17} /> },
    ],
  },
  {
    key: "finanzas",
    href: "/panel/finanzas",
    label: "Pagos",
    icon: <MdAttachMoney size={18} />,
    module: "MODULE_FINANZAS",
  },
  {
    key: "diseno",
    href: "/panel/diseno",
    label: "Diseño",
    icon: <MdPalette size={18} />,
    module: "MODULE_DISENO",
  },
  {
    key: "planta",
    href: "/panel/planta",
    label: "Producción",
    icon: <MdPrecisionManufacturing size={18} />,
    module: "MODULE_PLANTA",
  },
  {
    key: "despachos",
    href: "/panel/despachos",
    label: "Despachos",
    icon: <MdLocalShipping size={18} />,
    module: "MODULE_LOGISTICA",
  },
  {
    key: "catalogo",
    href: "/panel/productos",
    label: "Catálogo",
    icon: <MdCategory size={18} />,
    children: [
      { href: "/panel/productos", label: "Productos", module: "MODULE_PRODUCTOS", icon: <MdCategory size={17} /> },
      { href: "/panel/costos", label: "Costos", module: "MODULE_COSTOS", group: "Precios", groupIcon: <MdAttachMoney size={14} />, icon: <MdAttachMoney size={17} /> },
      { href: "/panel/calculadora-precio", label: "Precio de Venta", module: "MODULE_CALCULADORA_PRECIO", icon: <MdCalculate size={17} /> },
    ],
  },
  {
    key: "operaciones",
    href: "/panel/operaciones",
    label: "Operaciones",
    icon: <MdPrecisionManufacturing size={18} />,
    children: [
      {
        href: "/panel/operaciones",
        label: "Tablero",
        module: "MODULE_PRODUCCION",
        anyModule: ["MODULE_PRODUCCION", "MODULE_ENSAMBLE", "MODULE_BODEGAS", "MODULE_LOGISTICA", "MODULE_MANTENIMIENTO"],
        icon: <MdDashboard size={17} />,
      },
      { href: "/panel/produccion/ordenes", label: "Órdenes de Producción", module: "MODULE_PRODUCCION", icon: <MdAssignment size={17} /> },
      { href: "/panel/produccion/moldes", label: "Moldes", module: "MODULE_PRODUCCION", icon: <MdSwapHoriz size={17} /> },
      { href: "/panel/produccion/departamentos", label: "Departamentos", module: "MODULE_PRODUCCION", icon: <MdApartment size={17} /> },
      { href: "/panel/bodegas", label: "Bodegas", module: "MODULE_BODEGAS", icon: <MdWarehouse size={17} /> },
      { href: "/panel/empaque", label: "Empaque", module: "MODULE_PEDIDOS", icon: <MdInventory2 size={17} /> },
      { href: "/panel/logistica", label: "Logística", module: "MODULE_LOGISTICA", icon: <MdLocalShipping size={17} /> },
      { href: "/panel/mantenimiento", label: "Mantenimiento", module: "MODULE_MANTENIMIENTO", icon: <MdBuild size={17} /> },
    ],
  },
  {
    key: "tickets",
    href: "/panel/tickets",
    label: "Solicitudes",
    icon: <MdConfirmationNumber size={18} />,
    module: "MODULE_TICKETS",
  },
  {
    key: "notificaciones",
    href: "/panel/notificaciones",
    label: "Notificaciones",
    icon: <MdNotificationsNone size={18} />,
    module: "MODULE_DASHBOARD",
  },
  {
    key: "rrhh",
    href: "/panel/rrhh",
    label: "Recursos Humanos",
    icon: <MdWork size={18} />,
    children: [
      { href: "/panel/rrhh", label: "Dashboard", module: "MODULE_RRHH", group: "General", groupIcon: <MdHome size={14} />, icon: <MdHome size={17} /> },
      { href: "/panel/rrhh/busqueda", label: "Búsqueda", module: "MODULE_RRHH", icon: <MdSearch size={17} /> },
      { href: "/panel/rrhh/notificaciones", label: "Notificaciones", module: "MODULE_RRHH", icon: <MdNotificationsNone size={17} /> },

      { href: "/panel/rrhh/empleados", label: "Empleados", module: "MODULE_RRHH", group: "Capital humano", groupIcon: <MdGroup size={14} />, icon: <MdPersonOutline size={17} /> },
      { href: "/panel/rrhh/departamentos", label: "Departamentos", module: "MODULE_RRHH", icon: <MdApartment size={17} /> },
      { href: "/panel/rrhh/asistencia", label: "Asistencia", module: "MODULE_RRHH", icon: <MdAccessTime size={17} /> },
      { href: "/panel/rrhh/vacaciones", label: "Vacaciones", module: "MODULE_RRHH", icon: <MdBeachAccess size={17} /> },
      { href: "/panel/rrhh/ausencias", label: "Ausencias", module: "MODULE_RRHH", icon: <MdRemoveCircleOutline size={17} /> },
      { href: "/panel/rrhh/horas-extras", label: "Horas Extras", module: "MODULE_RRHH", icon: <MdAccessTime size={17} /> },
      { href: "/panel/rrhh/nomina", label: "Nómina", module: "MODULE_RRHH", icon: <MdAttachMoney size={17} /> },
      { href: "/panel/rrhh/beneficios", label: "Beneficios", module: "MODULE_RRHH", icon: <MdCardGiftcard size={17} /> },

      { href: "/panel/rrhh/documentos", label: "Documentos", module: "MODULE_RRHH", group: "Operación", groupIcon: <MdAssignment size={14} />, icon: <MdDescription size={17} /> },
      { href: "/panel/rrhh/certificados", label: "Certificados", module: "MODULE_RRHH", icon: <MdVerified size={17} /> },
      { href: "/panel/rrhh/solicitudes/categorias", label: "Categorías de solicitud", module: "MODULE_RRHH", icon: <MdSettings size={17} /> },
      { href: "/panel/rrhh/noticias", label: "Noticias", module: "MODULE_RRHH", icon: <MdArticle size={17} /> },
      { href: "/panel/rrhh/flujos", label: "Flujos", module: "MODULE_RRHH", icon: <MdSwapHoriz size={17} /> },
      { href: "/panel/rrhh/inventario", label: "Inventario", module: "MODULE_RRHH", icon: <MdInventory2 size={17} /> },
      { href: "/panel/rrhh/crm", label: "CRM", module: "MODULE_RRHH", icon: <MdHandshake size={17} /> },

      { href: "/panel/rrhh/tesoreria", label: "Tesorería", module: "MODULE_RRHH", group: "Finanzas", groupIcon: <MdCreditCard size={14} />, icon: <MdCreditCard size={17} /> },
      { href: "/panel/rrhh/contabilidad", label: "Contabilidad", module: "MODULE_RRHH", icon: <MdBarChart size={17} /> },
      { href: "/panel/rrhh/reportes", label: "Reportes", module: "MODULE_RRHH", icon: <MdBarChart size={17} /> },

      { href: "/panel/rrhh/vendedores", label: "Vendedores", module: "MODULE_RRHH", group: "Equipo Presservac", groupIcon: <MdGroup size={14} />, icon: <MdPeople size={17} /> },
      { href: "/panel/rrhh/roles", label: "Roles", module: "MODULE_RRHH", icon: <MdAssignment size={17} /> },
      { href: "/panel/rrhh/ayuda", label: "Ayuda", module: "MODULE_RRHH", icon: <MdHelpOutline size={17} /> },
    ],
  },
  {
    key: "configuracion",
    href: "/panel/usuarios",
    label: "Configuración",
    icon: <MdSettings size={18} />,
    children: [
      { href: "/panel/usuarios", label: "Usuarios", module: "MODULE_USUARIOS", icon: <MdPeople size={17} /> },
      { href: "/panel/configuracion/modo-venta", label: "Modo de Venta", module: "MODULE_USUARIOS", icon: <MdShoppingCart size={17} />, superAdminOnly: true },
      { href: "/panel/configuracion/whatsapp-paises", label: "WhatsApp por País", module: "MODULE_USUARIOS", icon: <MdPublic size={17} />, superAdminOnly: true },
      { href: "/panel/bitacora", label: "Bitácora", module: "MODULE_USUARIOS", icon: <MdHistory size={17} />, superAdminOnly: true },
    ],
  },
];

/** Color de cada app (paleta Presservac): fondo del ícono y tono de su barra de secciones. */
export const APP_TONES: Record<string, { bg: string; fg: string; soft: string }> = {
  inicio:         { bg: "linear-gradient(145deg,#0B2E6B,#051C46)", fg: "#fff", soft: "#E6EAF3" },
  tareas:         { bg: "linear-gradient(145deg,#FF5A64,#D60517)", fg: "#fff", soft: "#FDECEE" },
  comercial:      { bg: "linear-gradient(145deg,#FF3B47,#B00413)", fg: "#fff", soft: "#FDECEE" },
  catalogo:       { bg: "linear-gradient(145deg,#1B3F80,#051C46)", fg: "#fff", soft: "#E6EAF3" },
  operaciones:    { bg: "linear-gradient(145deg,#2A4E8F,#0B2E6B)", fg: "#fff", soft: "#E6EAF3" },
  tickets:        { bg: "linear-gradient(145deg,#F2F3F6,#CCCCCC)", fg: "#051C46", soft: "#EEEFF2" },
  notificaciones: { bg: "linear-gradient(145deg,#FF5A64,#D60517)", fg: "#fff", soft: "#FDECEE" },
  rrhh:           { bg: "linear-gradient(145deg,#0B2E6B,#03132F)", fg: "#fff", soft: "#E6EAF3" },
  configuracion:  { bg: "linear-gradient(145deg,#F2F3F6,#CCCCCC)", fg: "#051C46", soft: "#EEEFF2" },
};
export const toneOf = (key?: string) => APP_TONES[key ?? ""] ?? APP_TONES.inicio;

export const childMatches = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Filtra el menú según los módulos que el usuario puede ver. */
export function visibleNav(visibleModules: Set<string> | null, isSuperAdmin: boolean): NavItem[] {
  if (!visibleModules) return [];
  const canSee = (m: NavChild) =>
    m.superAdminOnly ? isSuperAdmin : m.anyModule ? m.anyModule.some((mod) => visibleModules.has(mod)) : visibleModules.has(m.module);
  return NAV.map((item) => {
    if (!item.children) return item.module && visibleModules.has(item.module) ? item : null;
    const children = item.children.filter(canSee);
    return children.length > 0 ? { ...item, href: children[0].href, children } : null;
  }).filter((n): n is NavItem => n !== null);
}

/** App (área) en la que está el usuario: la que tenga la ruta más específica que coincida. */
export function activeApp(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .flatMap((item) => (item.children ? item.children.map((c) => ({ item, href: c.href })) : [{ item, href: item.href }]))
    .filter((x) => childMatches(pathname, x.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.item;
}

export const PanelNavContext = createContext<{ items: NavItem[]; ready: boolean; firstName: string }>({ items: [], ready: false, firstName: "" });
export const usePanelNav = () => useContext(PanelNavContext);

/** Ícono de app al estilo lanzador: recuadro redondeado con degradado y glifo. */
export function AppTile({ item, size = 46 }: { item: Pick<NavItem, "key" | "icon">; size?: number }) {
  const t = toneOf(item.key);
  return (
    <span
      className="pv-app-icon"
      style={{ width: size, height: size, background: t.bg, color: t.fg, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.46) }}
    >
      {item.icon}
    </span>
  );
}
