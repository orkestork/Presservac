import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient | null;
};

function hasExpectedDelegates(client: PrismaClient | null) {
  if (!client) return false;

  return (
    "product" in client &&
    "user" in client &&
    "cartItem" in client &&
    "order" in client &&
    "orderItem" in client &&
    "inventoryMovement" in client &&
    "pointTransaction" in client &&
    "reward" in client &&
    "rewardRedemption" in client &&
    "notification" in client &&
    "notificationRead" in client
  );
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  // DATABASE_POOL_MAX: tope de conexiones. En local, `prisma dev` aguanta una sola conexión
  // a la vez (con más se cierran: "ConnectionClosed"), así que .env.local pone 1.
  const poolMax = Number(process.env.DATABASE_POOL_MAX);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ...(Number.isInteger(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
  });

  return new PrismaClient({ adapter });
}

const cachedPrisma = hasExpectedDelegates(globalForPrisma.prisma ?? null)
  ? globalForPrisma.prisma
  : null;

export const prisma = cachedPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
