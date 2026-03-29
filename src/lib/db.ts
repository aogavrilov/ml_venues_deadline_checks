import "server-only";
import { PrismaClient } from "@prisma/client/index.js";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
