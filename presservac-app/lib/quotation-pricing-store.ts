import { prisma } from "@/lib/prisma";
import { DEFAULT_PRICING, mergePricing, type PricingConfig } from "@/lib/bag-pricing";

const KEY = "quotation_pricing";

export async function getPricingConfig(): Promise<PricingConfig> {
  if (!prisma) return DEFAULT_PRICING;
  const row = await prisma.appConfig.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_PRICING;
  try {
    return mergePricing(JSON.parse(row.value));
  } catch {
    return DEFAULT_PRICING;
  }
}

export async function savePricingConfig(raw: unknown): Promise<PricingConfig> {
  if (!prisma) throw new Error("DATABASE_NOT_CONFIGURED");
  const cfg = mergePricing(raw);
  const value = JSON.stringify(cfg);
  await prisma.appConfig.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return cfg;
}
