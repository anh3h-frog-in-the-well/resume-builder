import { PrismaClient } from "@prisma/client";
import { migrateLegacyDrafts } from "../service/legacy-migration";

const globalForPrisma = globalThis as typeof globalThis & {
  prismaClientPromise?: Promise<PrismaClient>;
};

async function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }

  try {
    await migrateLegacyDrafts(prisma);
  } catch (error) {
    console.error(
      "The legacy resume migration failed; the legacy tables were left in place.",
      error,
    );
  }

  return prisma;
}

export function getPrismaClient(): Promise<PrismaClient> {
  if (!globalForPrisma.prismaClientPromise) {
    const clientPromise = createPrismaClient();
    globalForPrisma.prismaClientPromise = clientPromise;
    void clientPromise.catch(() => {
      if (globalForPrisma.prismaClientPromise === clientPromise) {
        delete globalForPrisma.prismaClientPromise;
      }
    });
  }
  return globalForPrisma.prismaClientPromise;
}
