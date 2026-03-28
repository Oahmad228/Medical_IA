const express = require("express");
const { prisma } = require("../db/prisma");
const { authRequired, requireRole } = require("../middleware/auth");

/**
 * [Module: src/routes/admin.js] listDoctorRequests
 * Lists doctor accounts by status for superadmin review.
 */
async function listDoctorRequests(req, res) {
  try {
    const status = String(req.query.status || "PENDING").toUpperCase();

    const allowedStatuses = ["PENDING", "ACTIVE", "REJECTED", "BANNED"];
    const requests = await prisma.user.findMany({
      where: {
        role: "DOCTOR",
        status: allowedStatuses.includes(status) ? status : "PENDING",
      },
      include: { doctorProfile: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture demandes", details: error.message });
  }
}

/**
 * [Module: src/routes/admin.js] approveDoctorRequest
 * Approves a doctor account and records reviewer metadata.
 */
async function approveDoctorRequest(req, res) {
  try {
    const userId = Number(req.params.userId);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });

    if (!target || target.role !== "DOCTOR") {
      return res.status(404).json({ error: "Compte medecin introuvable." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    if (target.doctorProfile) {
      await prisma.doctorProfile.update({
        where: { userId },
        data: {
          reviewedById: req.session.id,
          approvalNote: note,
          approvedAt: new Date(),
        },
      });
    }

    return res.json({ message: "Compte medecin valide avec succes." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur validation", details: error.message });
  }
}

/**
 * [Module: src/routes/admin.js] rejectDoctorRequest
 * Rejects a doctor account and stores the reviewer note.
 */
async function rejectDoctorRequest(req, res) {
  try {
    const userId = Number(req.params.userId);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });

    if (!target || target.role !== "DOCTOR") {
      return res.status(404).json({ error: "Compte medecin introuvable." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "REJECTED" },
    });

    if (target.doctorProfile) {
      await prisma.doctorProfile.update({
        where: { userId },
        data: {
          reviewedById: req.session.id,
          approvalNote: note,
          approvedAt: null,
        },
      });
    }

    return res.json({ message: "Compte medecin rejete." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur rejet", details: error.message });
  }
}

/**
 * [Module: src/routes/admin.js] banDoctorAccount
 * Bans a doctor account (access revoked).
 */
async function banDoctorAccount(req, res) {
  try {
    const userId = Number(req.params.userId);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });

    if (!target || target.role !== "DOCTOR") {
      return res.status(404).json({ error: "Compte medecin introuvable." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "BANNED" },
    });

    if (target.doctorProfile) {
      await prisma.doctorProfile.update({
        where: { userId },
        data: {
          reviewedById: req.session.id,
          approvalNote: note,
          approvedAt: null,
        },
      });
    }

    return res.json({ message: "Compte medecin banni." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur bannissement", details: error.message });
  }
}

/**
 * [Module: src/routes/admin.js] unbanDoctorAccount
 * Restores a banned doctor account.
 */
async function unbanDoctorAccount(req, res) {
  try {
    const userId = Number(req.params.userId);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });

    if (!target || target.role !== "DOCTOR") {
      return res.status(404).json({ error: "Compte medecin introuvable." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    if (target.doctorProfile) {
      await prisma.doctorProfile.update({
        where: { userId },
        data: {
          reviewedById: req.session.id,
          approvalNote: note,
          approvedAt: new Date(),
        },
      });
    }

    return res.json({ message: "Compte medecin debanni." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur debannissement", details: error.message });
  }
}

/**
 * [Module: src/routes/admin.js] createAdminRouter
 * Builds the admin router for doctor approvals.
 */
function createAdminRouter() {
  const router = express.Router();
  router.get("/doctor-requests", authRequired, requireRole("SUPERADMIN"), listDoctorRequests);
  router.post(
    "/doctor-requests/:userId/approve",
    authRequired,
    requireRole("SUPERADMIN"),
    approveDoctorRequest
  );
  router.post(
    "/doctor-requests/:userId/reject",
    authRequired,
    requireRole("SUPERADMIN"),
    rejectDoctorRequest
  );
  router.post(
    "/doctor-requests/:userId/ban",
    authRequired,
    requireRole("SUPERADMIN"),
    banDoctorAccount
  );
  router.post(
    "/doctor-requests/:userId/unban",
    authRequired,
    requireRole("SUPERADMIN"),
    unbanDoctorAccount
  );
  return router;
}

module.exports = { createAdminRouter };
