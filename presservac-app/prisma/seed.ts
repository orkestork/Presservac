/**
 * Seed de Presservac: solo crea los accesos iniciales. No siembra productos,
 * clientes ni datos de ninguna otra empresa; el catálogo se carga desde el panel.
 * Las claves vienen de variables de entorno (o se generan y se imprimen una vez).
 */
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run prisma db seed.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const ACCOUNTS = [
  {
    email: process.env.SEED_ADMIN_EMAIL || "admin@presservac.com.co",
    password: process.env.SEED_ADMIN_PASSWORD,
    fullName: "Administrador Presservac",
    // SUPERADMIN ve todos los módulos del panel; también pide el PIN adicional.
    role: "SUPERADMIN" as const,
  },
  {
    email: process.env.SEED_CLIENT_EMAIL || "cliente.demo@presservac.com.co",
    password: process.env.SEED_CLIENT_PASSWORD,
    fullName: "Cliente de prueba",
    company: "Empresa de prueba S.A.S.",
    role: "CUSTOMER" as const,
  },
];

async function main() {
  for (const acc of ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: acc.email } });
    if (existing) {
      console.log(`= ${acc.role.padEnd(8)} ${acc.email} (ya existía, sin cambios)`);
      continue;
    }
    const password = acc.password || `Pv-${randomBytes(6).toString("base64url")}`;
    await prisma.user.create({
      data: {
        email: acc.email,
        fullName: acc.fullName,
        company: "company" in acc ? acc.company : null,
        role: acc.role,
        passwordHash: await hash(password, 10),
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
      },
    });
    console.log(`✔ ${acc.role.padEnd(8)} ${acc.email} · clave: ${password}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
