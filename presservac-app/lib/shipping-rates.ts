export type ShippingZone = "bogota" | "nacional";

export const SHIPPING_RATES: Record<ShippingZone, { label: string; price: number }> = {
  bogota:    { label: "Bogotá D.C.", price: 0 },
  nacional:  { label: "Resto del país", price: 12000 },
};

export function getShippingForLocation(department: string, city: string): { zone: ShippingZone; label: string; price: number } {
  const zone: ShippingZone = department === "Cundinamarca" && city === "Bogotá" ? "bogota" : "nacional";
  return { zone, ...SHIPPING_RATES[zone] };
}

export function formatShippingPrice(price: number): string {
  return price === 0 ? "Gratis 🎉" : "$ " + price.toLocaleString("es-CO");
}

// Envío fijo por SKU+cantidad para packs de insumos que exceden peso/volumen normal.
export const SHIPPING_OVERRIDES_BY_SKU: Record<string, Record<number, number>> = {};

export function getShippingOverride(items: { sku?: string; cantidad: number }[]): number | null {
  let max: number | null = null;
  for (const item of items) {
    if (!item.sku) continue;
    const price = SHIPPING_OVERRIDES_BY_SKU[item.sku]?.[item.cantidad];
    if (price !== undefined) max = max === null ? price : Math.max(max, price);
  }
  return max;
}
