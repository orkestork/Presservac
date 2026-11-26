import {
  categorias,
  formatearMoneda,
  slugCategoria,
  type Categoria,
} from "@/app/data/catalog";
import { getProducts, type StoreProduct } from "@/lib/products";

export type ChatSuggestion = {
  label: string;
  href?: string;
  action?: string;
};

export type ChatProductCard = {
  slug: string;
  nombre: string;
  precio: string;
  imagen: string;
  href: string;
};

export type CatalogSnapshot = {
  matchedProducts: StoreProduct[];
  matchedCategories: Categoria[];
  allCategories: Categoria[];
};

// Levenshtein distance para detectar typos
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Umbral: 1 error para palabras cortas, 2 para largas
function fuzzyMatch(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (Math.abs(token.length - keyword.length) > 2) return false;
  const maxDist = token.length <= 5 ? 1 : 2;
  return levenshtein(token, keyword) <= maxDist;
}

// Palabras clave del dominio Presservac para fuzzy matching
const DOMAIN_KEYWORDS = [
  "empaque","empaques","doypack","flowpack","vacio","laminado","laminados","rollo","rollos",
  "termoformado","bolsa","bolsas","zipper","valvula","impresion","impreso","troquel","sello",
  "alimentos","cafe","snacks","salsas","refrigerados","mascotas","agro","aseo","barrera",
];

const STOP_WORDS = new Set([
  "y","o","de","la","el","los","las","un","una","unos","unas","en","que","es","se",
  "con","por","para","del","al","lo","me","te","mi","tu","su","nos","les","si",
  "no","mas","pero","como","hay","ya","muy","bien","quiero","busco","tengo","necesito",
  "quisiera","podrian","pueden","puedo","tienen","tiene","quiero","dame","dame","ver",
]);

const FUERA_CATALOGO = [
  "cama","colchon","colchones","mueble","muebles","silla","sofa","mesa","escritorio",
  "computador","celular","telefono","televisor","nevera","lavadora","carro","coche",
  "ropa","zapato","comida","medicamento","droga","planta","mascota","juguete","libro",
];

// Sinónimos: palabra del usuario → términos equivalentes del catálogo
const SYNONYMS: Record<string, string[]> = {
  "bolsa":       ["doypack", "empaque"],
  "bolsas":      ["doypack", "empaque"],
  "stand":       ["doypack"],
  "cierre":      ["zipper", "doypack"],
  "cremallera":  ["zipper", "doypack"],
  "vacio":       ["empaques al vacio", "termoformado"],
  "pelicula":    ["laminados", "rollos"],
  "lamina":      ["laminados", "rollos"],
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string) {
  const base = normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  const expanded = new Set(base);
  for (const token of base) {
    const synonyms = SYNONYMS[token];
    if (synonyms) synonyms.forEach((s) => expanded.add(s));
  }
  return [...expanded];
}

function scoreProduct(product: StoreProduct, queryTokens: string[]) {
  if (queryTokens.length === 0) return 0;

  const nombre = normalizeText(product.nombre);
  const categoria = normalizeText(product.categoria);
  const marca = normalizeText(product.marca);
  const haystack = normalizeText(
    [product.nombre, product.marca, product.categoria, product.descripcion || "", product.sku || "", product.disponibilidad, product.slug].join(" "),
  );
  const nombreTokens = nombre.split(/\s+/);
  const haystackTokens = haystack.split(/\s+/);

  return queryTokens.reduce((score, token) => {
    // Exact matches
    if (nombre.includes(token)) return score + 7;
    if (categoria.includes(token)) return score + 5;
    if (marca.includes(token)) return score + 4;
    if (haystack.includes(token)) return score + 2;
    // Fuzzy matches (typos)
    if (nombreTokens.some((w) => fuzzyMatch(token, w))) return score + 5;
    if (haystackTokens.some((w) => fuzzyMatch(token, w))) return score + 1;
    return score;
  }, 0);
}

function getMatchedCategories(query: string) {
  const normalized = normalizeText(query);
  const queryTokens = tokenize(query);

  return categorias.filter((category) => {
    const categoryValue = normalizeText(category);
    const catWords = categoryValue.split(/\s+/).filter((w) => w.length > 3);
    return (
      normalized.includes(categoryValue) ||
      normalized.includes(slugCategoria(category)) ||
      catWords.some((word) => normalized.includes(word)) ||
      queryTokens.some((token) => catWords.some((word) => fuzzyMatch(token, word)))
    );
  });
}

const SLUGS_SALUD: string[] = [];
const KEYWORDS_SALUD = ["clinica","hospital","laboratorio","consultorio","medico","salud","codo","elbow","enfermeria","farmacia","veterinaria","odontologia","dentista","optometria","estetica","cosmetologia"];
const SLUGS_DOBLE: string[] = [];
const KEYWORDS_DOBLE = ["doble","dual","dos productos","jabon y shampoo","shampoo y jabon","jabon y champu","champu y jabon","dos liquidos","dos compartimentos","dos usos","doble uso"];
const KEYWORDS_CALIDAD = ["durabilidad","durable","dura","duradero","duraderos","largo plazo","calidad","higienico","higienicos","mejor","mejores","resistente","resistentes","profesional","premium"];
const KEYWORDS_ALTO_FLUJO = ["hotel","restaurante","oficina","empresa","empresas","fabrica","bodega","gym","gimnasio","salon","colegio","hospital","centro","mall","comercial","plaza","aeropuerto","estadio","universidad","banco","spa","cafeteria","bar","club","alto flujo","alto trafico","mucha gente","muchas personas","concurrido","institucional"];

export async function getCatalogSnapshot(query: string, spaceContext?: string): Promise<CatalogSnapshot> {
  const products = await getProducts();
  const queryTokens = tokenize(query);
  const matchedCategories = getMatchedCategories(query);

  const normalizedQuery = normalizeText(query);
  const contextFull = spaceContext ? `${normalizedQuery} ${normalizeText(spaceContext)}` : normalizedQuery;
  const esSalud = KEYWORDS_SALUD.some((k) => contextFull.includes(k));
  const esCalidad = KEYWORDS_CALIDAD.some((k) => contextFull.includes(k));
  const esAltoFlujo = KEYWORDS_ALTO_FLUJO.some((k) => contextFull.includes(k));
  const esDoble = KEYWORDS_DOBLE.some((k) => contextFull.includes(k));
  // No aplicar boost acero si la consulta también pide plástico (señales contradictorias)
  const esAceroContext = (contextFull.includes("acero") || contextFull.includes("inoxidable") || contextFull.includes("klinox") || contextFull.includes("metalico") || contextFull.includes("metal"))
    && !(contextFull.includes("plastico") || contextFull.includes("abs"));

  const scored = products
    .map((product) => {
      let score = scoreProduct(product, queryTokens) +
        (matchedCategories.includes(product.categoria) ? 6 : 0);
      // Boost para productos de salud (Codo/Elbow)
      if (esSalud && SLUGS_SALUD.includes(product.slug)) score += 50;
      // Boost para dispensador doble cuando buscan dos productos
      if (esDoble && SLUGS_DOBLE.includes(product.slug)) score += 50;
      // Boost para KlinOx cuando preguntan por durabilidad/calidad/lo mejor o alto flujo
      if ((esCalidad || esAltoFlujo) && normalizeText(product.categoria).includes("klinox")) score += 30;
      // Boost para KlinOx cuando el contexto indica acero/inoxidable explícitamente
      if (esAceroContext && normalizeText(product.categoria).includes("klinox")) score += 40;
      // Boost para Hoteles y Restaurantes cuando el espacio es hotel/restaurante/spa
      if (contextFull.match(/hotel|restaurante|spa|bar/) && normalizeText(product.categoria).includes("hoteles")) score += 25;
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.product);

  return {
    matchedProducts: scored,
    matchedCategories,
    allCategories: categorias,
  };
}

export function buildCatalogContext(snapshot: CatalogSnapshot) {
  const productLines =
    snapshot.matchedProducts.length > 0
      ? snapshot.matchedProducts
          .map((product) => {
            return `- ${product.nombre} | categoria: ${product.categoria} | marca: ${product.marca} | precio: ${formatearMoneda(product.precioValor)} | disponibilidad: ${product.disponibilidad} | stock: ${product.stock ?? 0} | link: /producto/${product.slug}`;
          })
          .join("\n")
      : "- No hubo coincidencias directas en el catálogo para esta consulta.";

  return [
    `Categorias disponibles: ${snapshot.allCategories.join(", ")}.`,
    snapshot.matchedCategories.length > 0
      ? `Categorias relacionadas con la consulta: ${snapshot.matchedCategories.join(", ")}.`
      : "No hubo una categoría exacta identificada en la consulta.",
    "Productos más relevantes del catálogo:",
    productLines,
  ].join("\n");
}

/**
 * Catálogo completo (todos los productos activos) para asistentes que necesitan
 * conocer toda la oferta, no solo las coincidencias de una consulta. Se usa en el
 * bot de WhatsApp para responder por cualquier producto de la página.
 */
const GENERIC_SPEC_LABELS = new Set(["Observaciones", "Categoría", "Marca", "Disponibilidad", "Garantía", "Aplicación"]);

export async function buildFullCatalogContext() {
  const products = await getProducts();
  const lines = products.map((product) => {
    const description = product.descripcion
      ? product.descripcion.replace(/\s+/g, " ").trim().slice(0, 220)
      : null;
    // Ficha (Sistema Maestro §10): solo lo que existe en la base, sin rellenar.
    const specs = (product.especificacionesTecnicas ?? [])
      .filter((spec) => !GENERIC_SPEC_LABELS.has(spec.etiqueta) && spec.valor.trim())
      .map((spec) => `${spec.etiqueta}: ${spec.valor.replace(/\s+/g, " ").trim().slice(0, 80)}`);
    const colors = (product.variacionesColor ?? []).map((variant) => variant.label).filter(Boolean);
    return [
      `- ${product.nombre}`,
      `categoría: ${product.categoria}`,
      product.sku && `referencia: ${product.sku}`,
      `marca: ${product.marca}`,
      `precio: ${formatearMoneda(product.precioValor)}`,
      `disponibilidad: ${product.disponibilidad}`,
      `stock: ${product.stock ?? 0}`,
      `slug: ${product.slug}`,
      colors.length > 0 && `colores: ${colors.join(", ")}`,
      specs.length > 0 && `ficha: ${specs.join("; ")}`,
      product.garantia && `garantía: ${product.garantia}`,
      description && `descripción: ${description}`,
      product.actualizadoEl && `actualizado: ${product.actualizadoEl}`,
    ]
      .filter(Boolean)
      .join(" | ");
  });

  return [
    `CATÁLOGO COMPLETO DE PRESSERVAC (${products.length} productos activos):`,
    `Categorías: ${categorias.join(", ")}.`,
    ...lines,
  ].join("\n");
}

function buildProductSuggestions(products: StoreProduct[]): ChatSuggestion[] {
  return products.slice(0, 4).map((product) => ({
    label: product.nombre,
    href: `/producto/${product.slug}`,
  }));
}

export function buildProductCards(products: StoreProduct[]): ChatProductCard[] {
  return products.slice(0, 4).map((product) => ({
    slug: product.slug,
    nombre: product.nombre,
    precio: product.precio,
    imagen: product.imagen,
    href: `/producto/${product.slug}`,
  }));
}

function buildCategorySuggestions(categoriesToSuggest: Categoria[]): ChatSuggestion[] {
  return categoriesToSuggest.slice(0, 3).map((category) => ({
    label: category,
    href: `/categorias?categoria=${slugCategoria(category)}`,
  }));
}

export function buildLocalAssistantReply(
  query: string,
  snapshot: CatalogSnapshot,
): {
  message: string;
  suggestions?: ChatSuggestion[];
  products?: ChatProductCard[];
} {
  const normalized = normalizeText(query);

  if (!normalized) {
    return {
      message: "¡Hola! Soy el asistente de Presservac. Cuéntame qué producto quieres empacar y te ayudo a encontrar el empaque indicado.",
      suggestions: buildCategorySuggestions(snapshot.allCategories),
    };
  }

  if (snapshot.matchedProducts.length > 0) {
    return {
      message: "Estas referencias coinciden con lo que buscas 👇 ¿Quieres que un asesor te prepare la cotización?",
      suggestions: buildProductSuggestions(snapshot.matchedProducts),
      products: buildProductCards(snapshot.matchedProducts),
    };
  }

  if (snapshot.matchedCategories.length > 0) {
    return {
      message: `Manejamos la línea **${snapshot.matchedCategories.join(", ")}**. ¿Qué producto vas a empacar y en qué cantidad?`,
      suggestions: buildCategorySuggestions(snapshot.matchedCategories),
    };
  }

  return {
    message: `No encontré una coincidencia exacta. En Presservac manejamos: ${snapshot.allCategories.join(", ")}. Un asesor puede ayudarte con tu caso.`,
    suggestions: buildCategorySuggestions(snapshot.allCategories),
  };
}
