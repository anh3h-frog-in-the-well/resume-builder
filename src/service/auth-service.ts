import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../lib/prisma";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
};

export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  const prisma = await getPrismaClient();
  return prisma.account.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
}

export async function createPasswordUser(
  email: string,
  name: string,
  passwordHash: string,
) {
  const prisma = await getPrismaClient();
  return prisma.account.create({
    data: { id: randomUUID(), email, name, passwordHash },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
}
