export type CategoriaMeta = {
  nombre: string;
  color: string;
  icono: string;
  iconoImagen?: string;
  flipImagen?: boolean;
  bannerImagen?: string;
  heroBannerImagen?: string;
  heroBannerMovil?: string;
  bannerCopy?: string;
  /** Título y descripción para buscadores (meta title/description de la categoría). */
  seoTitle?: string;
  seoDescription?: string;
  heroTitulo1?: string;
  heroTitulo2?: string;
  heroDestacado?: string;
  textoDark?: boolean;
  ocultarTextoHero?: boolean;
  heroBannerMovilPosition?: string;
  beneficiosInline?: boolean;
  beneficiosHero?: { icono: string; imagen?: string; texto: string }[];
  comoElegirFoca?: string;
  comoElegirTitulo?: string;
  comoElegirTituloCompleto?: string;
  comoElegirSubtitulo?: string;
  comoElegirDark?: boolean;
  comoElegirBannerWeb?: string;
  comoElegirBannerMovil?: string;
  comoElegir?: { icono: string; imagen?: string; titulo: string; descripcion: string }[];
};

// Líneas de producto de Presservac (presservac.com.co). Los productos se crean desde el panel.
export const categoriasData: readonly CategoriaMeta[] = [
  { nombre: "Doypack", color: "#051C46", icono: "◆" },
  { nombre: "Flowpack", color: "#051C46", icono: "◆" },
  { nombre: "Empaques al vacío", color: "#051C46", icono: "◆" },
  { nombre: "Laminados", color: "#051C46", icono: "◆" },
  { nombre: "Rollos impresos", color: "#051C46", icono: "◆" },
  { nombre: "Termoformado", color: "#051C46", icono: "◆" },
];

export type Categoria = (typeof categoriasData)[number]["nombre"];
export const categorias = categoriasData.map((item) => item.nombre) as Categoria[];
export const disponibilidades = [
  "Entrega inmediata",
  "Disponible por pedido",
  "Recoger en tienda",
  "Agotado",
] as const;
export type Disponibilidad = (typeof disponibilidades)[number];

export type ProductoEspecificacion = {
  etiqueta: string;
  valor: string;
};

export type VariacionColor = {
  color: string;
  label: string;
  image: string;
  images?: string[];
  sku?: string;
  skuSello?: string;
  precioValor?: number;
  precioAnteriorValor?: number;
  variacionesPresentacion?: VariacionPresentacion[];
};

export type VariacionPresentacion = {
  label: string;
  image: string;
  images?: string[];
  sku?: string;
  skuSello?: string;
  slugSuffix?: string;
};

/** Máximo de imágenes extra por producto (además de la principal). */
export const MAX_EXTRA_IMAGES = 8;

export type ProductoCatalogo = {
  slug: string;
  sku?: string;
  oemReferencia?: string;
  referenciasAlternas?: string[];
  categoria: Categoria;
  nombre: string;
  marca: string;
  precio: string;
  precioAnterior: string;
  precioValor: number;
  stock?: number;
  stockMinimo?: number;
  estadoInventario?: "in-stock" | "low-stock" | "out-of-stock";
  puedeComprar?: boolean;
  descuento: string;
  imagen: string;
  imagenesExtra?: string[];
  disponibilidad: Disponibilidad;
  descripcion?: string;
  aplicacion?: string;
  compatibilidad?: string[];
  garantia?: string;
  especificacionesTecnicas?: ProductoEspecificacion[];
  variacionesColor?: VariacionColor[];
  variacionesPresentacion?: VariacionPresentacion[];
  presentacionesAdministradas?: boolean;
  videoUrl?: string;
  destacado?: boolean;
  esOutlet?: boolean;
  outletExpiraEl?: string | null;
  preciosPorCantidad?: { cantidad: number; precioUnitario: number }[];
};

// Sin productos precargados: Presservac los crea desde el panel de administración.
export const productosCatalogo: ProductoCatalogo[] = [];

export const slugCategoria = (categoria: string) =>
  categoria
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const categoriaDesdeSlug = (slug: string | null) =>
  categorias.find((categoria) => slugCategoria(categoria) === slug) ?? null;

export const categoriaMeta = (categoria: string) =>
  categoriasData.find((item) => item.nombre === categoria) ?? categoriasData[0];

export const productoPorSlug = (slug: string) =>
  productosCatalogo.find((producto) => producto.slug === slug) ?? null;

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatearMoneda(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatearDescuento(
  precioActual: number,
  precioAnterior: number,
) {
  const precioBase = Math.max(precioActual, precioAnterior, 1);
  const descuento = Math.max(
    0,
    Math.round(((precioBase - precioActual) / precioBase) * 100),
  );

  return `-${descuento}%`;
}

export function descripcionProducto({
  nombre,
  categoria,
  marca,
}: {
  nombre: string;
  categoria: string;
  marca: string;
}) {
  return `${nombre} de la línea ${categoria}, marca ${marca}, pensado para reposición confiable y operación continua.`;
}
