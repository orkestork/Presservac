export const VOLUME_DISCOUNT_TIERS = [
  { min: 100, pct: 12 },
  { min: 48, pct: 10 },
  { min: 12, pct: 8 },
  { min: 1, pct: 0 },
];

export const PRODUCT_VOLUME_PRICES: Record<
  string,
  { unit: number; tiers: { min: number; unitPrice: number }[] }
> = {};

// Llaves por SKU (estable ante ediciones de nombre/foto) en vez de slug.
// El slug se regenera automáticamente del nombre en cada edición del producto
// (ver lib/products.ts updateProduct), así que usarlo como llave rompía estos
// mapas cada vez que alguien tocaba el nombre o subía una foto y reenviaba el
// formulario completo. El SKU solo cambia si se edita explícitamente ese campo.
export const INSUMO_PACK_TIERS_BY_SKU: Record<string, { label: string; qty: number; totalPrice: number }[]> = {};

export const NO_PACK_SKUS = new Set<string>([]);

// Insumos que no se venden "por unidad" — el mínimo de venta es el paquete
// más chico definido en INSUMO_PACK_TIERS_BY_SKU. Se oculta el botón "Unidad".
export const NO_UNIT_SALE_SKUS = new Set<string>([]);

export type TipoVariante = {
  label: string;
  slugSuffix: string;
  image?: string;
  images?: string[];
  sku?: string;
  skuSello?: string;
};

export const TIPO_VARIANTES: Record<string, TipoVariante[]> = {};

export function parsePriceValue(price: string): number {
  return parseInt(price.replace(/[^\d]/g, ""), 10) || 0;
}

export function formatPrice(value: number): string {
  return "$ " + Math.round(value).toLocaleString("es-CO");
}

export function getVolumeDiscount(quantity: number) {
  return VOLUME_DISCOUNT_TIERS.find((tier) => quantity >= tier.min) ?? VOLUME_DISCOUNT_TIERS.at(-1)!;
}

export function getVolumePricing(
  price: string,
  quantity: number,
  productSlug?: string,
  preciosPorCantidad?: { cantidad: number; precioUnitario: number }[],
  productSku?: string,
  packTiers?: { label: string; qty: number; totalPrice: number }[],
) {
  // Insumos: paquetes reales (DB si el producto los tiene configurados, si no el mapa estático), precio total fijo (no porcentaje)
  const insumoPacks = packTiers && packTiers.length > 0 ? packTiers : (productSku ? INSUMO_PACK_TIERS_BY_SKU[productSku] : undefined);
  if (insumoPacks) {
    const baseUnitPrice = parsePriceValue(price);
    const match = [...insumoPacks].sort((a, b) => b.qty - a.qty).find((t) => quantity >= t.qty);
    if (match) {
      const discountedUnitPrice = match.totalPrice / match.qty;
      return {
        tier: { min: match.qty, pct: Math.max(0, Math.round(((baseUnitPrice - discountedUnitPrice) / baseUnitPrice) * 100)) },
        baseUnitPrice,
        discountedUnitPrice,
        unitPriceLabel: formatPrice(discountedUnitPrice),
        totalLabel: formatPrice(match.totalPrice),
        hasDiscount: true,
      };
    }
  }

  // Primary source: preciosPorCantidad from catalog
  if (preciosPorCantidad && preciosPorCantidad.length > 0) {
    const x1 = preciosPorCantidad.find((t) => t.cantidad === 1);
    const baseUnitPrice = x1?.precioUnitario ?? parsePriceValue(price);
    // Find the highest matching tier (exact match on cantidad for pack buttons)
    const match = [...preciosPorCantidad]
      .sort((a, b) => b.cantidad - a.cantidad)
      .find((t) => quantity >= t.cantidad);

    if (match) {
      const discountedUnitPrice = match.precioUnitario;
      const total = discountedUnitPrice * quantity;
      const pct = Math.max(
        0,
        Math.round(((baseUnitPrice - discountedUnitPrice) / baseUnitPrice) * 100),
      );
      return {
        tier: { min: match.cantidad, pct },
        baseUnitPrice,
        discountedUnitPrice,
        unitPriceLabel: formatPrice(discountedUnitPrice),
        totalLabel: formatPrice(total),
        hasDiscount: match.cantidad > 1,
      };
    }
  }

  // Fallback: PRODUCT_VOLUME_PRICES (legacy slugs)
  const exactPricing = productSlug ? PRODUCT_VOLUME_PRICES[productSlug] : undefined;
  const baseUnitPrice = exactPricing?.unit ?? parsePriceValue(price);
  const exactTier = exactPricing?.tiers.find((item) => quantity >= item.min);

  if (exactTier) {
    const discountedUnitPrice = exactTier.unitPrice;
    const total = discountedUnitPrice * quantity;
    const pct = Math.max(
      0,
      Math.round(((baseUnitPrice - discountedUnitPrice) / baseUnitPrice) * 100),
    );
    return {
      tier: { min: exactTier.min, pct },
      baseUnitPrice,
      discountedUnitPrice,
      unitPriceLabel: formatPrice(discountedUnitPrice),
      totalLabel: formatPrice(total),
      hasDiscount: true,
    };
  }

  const tier = getVolumeDiscount(quantity);
  const discountedUnitPrice = baseUnitPrice * (1 - tier.pct / 100);
  const total = discountedUnitPrice * quantity;

  return {
    tier,
    baseUnitPrice,
    discountedUnitPrice,
    unitPriceLabel: formatPrice(discountedUnitPrice),
    totalLabel: formatPrice(total),
    hasDiscount: tier.pct > 0,
  };
}

/**
 * Precio "normal" de un item de combo: si la cantidad coincide con un paquete
 * del producto (los de DB, o el mapa estático por SKU), vale el precio total del
 * paquete; si no, precio unitario × cantidad.
 */
export function getComboItemNormalPrice(
  product: { price: number; sku?: string | null; packPrices?: { label: string; qty: number; totalPrice: number }[] | null },
  quantity: number,
): number {
  const packs = getProductPacks(product);
  if (packs.length > 0) {
    const exact = packs.find((pack) => pack.qty === quantity);
    if (exact) return exact.totalPrice;

    const byQtyDesc = [...packs].sort((a, b) => b.qty - a.qty);
    // Cantidad suelta: se cobra al unitario del paquete que alcanza (igual que la ficha del producto)
    const reached = byQtyDesc.find((pack) => quantity >= pack.qty);
    if (reached) return Math.round((reached.totalPrice / reached.qty) * quantity);

    // Insumos que no se venden por unidad: el unitario real es el del paquete
    // más chico, no `price` (que en estos SKUs guarda el valor del paquete).
    if (product.sku && NO_UNIT_SALE_SKUS.has(product.sku)) {
      const smallest = byQtyDesc[byQtyDesc.length - 1];
      return Math.round((smallest.totalPrice / smallest.qty) * quantity);
    }
  }
  return product.price * quantity;
}

/** Paquetes disponibles para un producto (DB primero, si no el mapa por SKU). */
export function getProductPacks(
  product: { sku?: string | null; packPrices?: { label: string; qty: number; totalPrice: number }[] | null },
): { label: string; qty: number; totalPrice: number }[] {
  if (product.packPrices && product.packPrices.length > 0) return product.packPrices;
  return (product.sku ? INSUMO_PACK_TIERS_BY_SKU[product.sku] : undefined) ?? [];
}

/**
 * Precio real por unidad. En los insumos que no se venden sueltos, `price`
 * guarda el valor del paquete, así que el unitario sale del paquete más chico.
 */
export function getProductUnitPrice(
  product: { price: number; sku?: string | null; packPrices?: { label: string; qty: number; totalPrice: number }[] | null },
): number {
  return getComboItemNormalPrice(product, 1);
}
