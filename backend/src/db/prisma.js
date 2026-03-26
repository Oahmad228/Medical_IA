const { PrismaClient } = require("@prisma/client");

/**
 * [Module: src/db/prisma.js] createPrismaClient
 * Creates a singleton Prisma client used by all services and routes.
 */
function createPrismaClient() {
  return new PrismaClient();
}

const prisma = createPrismaClient();

module.exports = { prisma };
