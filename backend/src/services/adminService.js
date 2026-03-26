const { prisma } = require("../db/prisma");
const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME } = require("../config/env");
const { hashPassword } = require("../utils/crypto");

/**
 * [Module: src/services/adminService.js] ensureSuperAdminSeed
 * Ensures a superadmin account exists at startup.
 */
async function ensureSuperAdminSeed() {
  const existing = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });

  if (existing) {
    if (existing.role !== "SUPERADMIN" || existing.status !== "ACTIVE") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "SUPERADMIN",
          status: "ACTIVE",
          fullName: SUPERADMIN_NAME,
          emailVerified: true,
        },
      });
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      fullName: SUPERADMIN_NAME,
      role: "SUPERADMIN",
      status: "ACTIVE",
      emailVerified: true,
      passwordHash: hashPassword(SUPERADMIN_PASSWORD),
    },
  });
}

module.exports = { ensureSuperAdminSeed };
