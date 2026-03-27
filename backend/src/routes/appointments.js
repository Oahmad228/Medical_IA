const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authRequired, requireRole } = require("../middleware/auth");
const { sendEmail } = require("../services/emailService");

/**
 * [Module: src/routes/appointments.js] parseDateInput
 * Parses an ISO or datetime-local string into a Date object.
 */
function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * [Module: src/routes/appointments.js] sendAppointmentEmailSafe
 * Sends appointment emails without blocking the main flow.
 */
async function sendAppointmentEmailSafe({ to, subject, text }) {
  if (!to) return;
  try {
    await sendEmail({ to, subject, text });
  } catch (_e) {
    // best effort
  }
}

/**
 * [Module: src/routes/appointments.js] formatDoctorInfo
 * Builds doctor profile info for appointment payloads.
 */
function formatDoctorInfo(doctorUser) {
  const profile = doctorUser?.doctorProfile || null;
  return {
    userId: doctorUser?.id || null,
    fullName: doctorUser?.fullName || "",
    email: doctorUser?.email || null,
    specialty: profile?.specialty || null,
    clinicName: profile?.clinicName || null,
    clinicAddress: profile?.clinicAddress || null,
    clinicCity: profile?.clinicCity || null,
    clinicLat: profile?.clinicLat ?? null,
    clinicLng: profile?.clinicLng ?? null,
  };
}

/**
 * [Module: src/routes/appointments.js] formatPatientInfo
 * Builds patient profile info for appointment payloads.
 */
function formatPatientInfo(patient) {
  return {
    id: patient?.id || null,
    fullName: patient?.fullName || "",
    email: patient?.user?.email || null,
    city: patient?.city || null,
  };
}

/**
 * [Module: src/routes/appointments.js] requestAppointment
 * Allows a patient to request an appointment with a doctor.
 */
async function requestAppointment(req, res) {
  try {
    const schema = z.object({
      doctorUserId: z.number().int().positive(),
      scheduledFor: z.string().trim().optional(),
      note: z.string().trim().max(2000).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const scheduledFor = parseDateInput(parsed.data.scheduledFor);
    if (parsed.data.scheduledFor && !scheduledFor) {
      return res.status(400).json({ error: "Date/heure invalide." });
    }

    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
      include: { user: true },
    });
    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    const doctorUser = await prisma.user.findUnique({
      where: { id: parsed.data.doctorUserId },
      include: { doctorProfile: true },
    });
    if (!doctorUser || doctorUser.role !== "DOCTOR" || doctorUser.status !== "ACTIVE") {
      return res.status(404).json({ error: "Medecin introuvable." });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorUserId: doctorUser.id,
        scheduledFor: scheduledFor || null,
        patientNote: parsed.data.note || null,
      },
      include: { doctor: { include: { doctorProfile: true } } },
    });

    await sendAppointmentEmailSafe({
      to: doctorUser.email,
      subject: "Nouvelle demande de rendez-vous - Medical AI",
      text: `Bonjour Dr ${doctorUser.fullName},\n\nUne demande de rendez-vous a ete soumise par ${patient.fullName}.\nDate/heure souhaitée: ${scheduledFor ? scheduledFor.toLocaleString() : "Non specifie"}.`,
    });

    return res.status(201).json({
      appointment: {
        id: appointment.id,
        status: appointment.status,
        requestedAt: appointment.requestedAt,
        scheduledFor: appointment.scheduledFor,
        patientNote: appointment.patientNote,
        doctorNote: appointment.doctorNote,
        doctor: formatDoctorInfo(appointment.doctor),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur reservation", details: error.message });
  }
}

/**
 * [Module: src/routes/appointments.js] listPatientAppointments
 * Lists appointments for the current patient.
 */
async function listPatientAppointments(req, res) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
    });
    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      include: { doctor: { include: { doctorProfile: true } } },
    });

    return res.json({
      appointments: appointments.map((appt) => ({
        id: appt.id,
        status: appt.status,
        requestedAt: appt.requestedAt,
        scheduledFor: appt.scheduledFor,
        patientNote: appt.patientNote,
        doctorNote: appt.doctorNote,
        doctor: formatDoctorInfo(appt.doctor),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture reservations", details: error.message });
  }
}

/**
 * [Module: src/routes/appointments.js] cancelPatientAppointment
 * Allows a patient to cancel their appointment.
 */
async function cancelPatientAppointment(req, res) {
  try {
    const appointmentId = Number(req.params.id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ error: "ID reservation invalide." });
    }

    const schema = z.object({ note: z.string().trim().max(2000).optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
      include: { user: true },
    });
    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: true },
    });
    if (!appointment || appointment.patientId !== patient.id) {
      return res.status(404).json({ error: "Reservation introuvable." });
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELED",
        patientNote: parsed.data.note || appointment.patientNote,
      },
    });

    await sendAppointmentEmailSafe({
      to: appointment.doctor?.email,
      subject: "Rendez-vous annule - Medical AI",
      text: `Bonjour Dr ${appointment.doctor?.fullName || ""},\n\nLe patient ${patient.fullName} a annule la reservation #${updated.id}.`,
    });

    return res.json({ appointment: updated });
  } catch (error) {
    return res.status(500).json({ error: "Erreur annulation reservation", details: error.message });
  }
}

/**
 * [Module: src/routes/appointments.js] listDoctorAppointments
 * Lists appointments for the current doctor.
 */
async function listDoctorAppointments(req, res) {
  try {
    const statusRaw = String(req.query.status || "").trim().toUpperCase();
    const allowed = ["REQUESTED", "ACCEPTED", "REJECTED", "CANCELED", "RESCHEDULED"];
    const status = allowed.includes(statusRaw) ? statusRaw : null;

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorUserId: req.session.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { patient: { include: { user: true } } },
    });

    return res.json({
      appointments: appointments.map((appt) => ({
        id: appt.id,
        status: appt.status,
        requestedAt: appt.requestedAt,
        scheduledFor: appt.scheduledFor,
        patientNote: appt.patientNote,
        doctorNote: appt.doctorNote,
        patient: formatPatientInfo(appt.patient),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture reservations", details: error.message });
  }
}

/**
 * [Module: src/routes/appointments.js] updateAppointmentStatus
 * Updates an appointment status for the doctor.
 */
async function updateAppointmentStatus({ req, res, status, requireSchedule }) {
  const appointmentId = Number(req.params.id);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: "ID reservation invalide." });
  }

  const schema = z.object({
    scheduledFor: z.string().trim().optional(),
    note: z.string().trim().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
  }

  const scheduledFor = parseDateInput(parsed.data.scheduledFor);
  if (parsed.data.scheduledFor && !scheduledFor) {
    return res.status(400).json({ error: "Date/heure invalide." });
  }
  if (requireSchedule && !scheduledFor) {
    return res.status(400).json({ error: "Date/heure requise pour replanifier." });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { include: { user: true } } },
  });
  if (!appointment || appointment.doctorUserId !== req.session.id) {
    return res.status(404).json({ error: "Reservation introuvable." });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      scheduledFor: scheduledFor || appointment.scheduledFor,
      doctorNote: parsed.data.note || appointment.doctorNote,
    },
  });

  await sendAppointmentEmailSafe({
    to: appointment.patient?.user?.email,
    subject: `Reservation ${status.toLowerCase()} - Medical AI`,
    text: `Bonjour ${appointment.patient?.fullName || ""},\n\nVotre reservation #${updated.id} est maintenant en statut ${status}.`,
  });

  return res.json({ appointment: updated });
}

/**
 * [Module: src/routes/appointments.js] createAppointmentsRouter
 * Builds the appointment router for patient and doctor flows.
 */
function createAppointmentsRouter() {
  const router = express.Router();

  router.post(
    "/patient/appointments/request",
    authRequired,
    requireRole("PATIENT"),
    requestAppointment
  );
  router.get(
    "/patient/appointments",
    authRequired,
    requireRole("PATIENT"),
    listPatientAppointments
  );
  router.post(
    "/patient/appointments/:id/cancel",
    authRequired,
    requireRole("PATIENT"),
    cancelPatientAppointment
  );

  router.get(
    "/doctor/appointments",
    authRequired,
    requireRole("DOCTOR"),
    listDoctorAppointments
  );
  router.post(
    "/doctor/appointments/:id/accept",
    authRequired,
    requireRole("DOCTOR"),
    (req, res) => updateAppointmentStatus({ req, res, status: "ACCEPTED", requireSchedule: false })
  );
  router.post(
    "/doctor/appointments/:id/reject",
    authRequired,
    requireRole("DOCTOR"),
    (req, res) => updateAppointmentStatus({ req, res, status: "REJECTED", requireSchedule: false })
  );
  router.post(
    "/doctor/appointments/:id/cancel",
    authRequired,
    requireRole("DOCTOR"),
    (req, res) => updateAppointmentStatus({ req, res, status: "CANCELED", requireSchedule: false })
  );
  router.post(
    "/doctor/appointments/:id/reschedule",
    authRequired,
    requireRole("DOCTOR"),
    (req, res) => updateAppointmentStatus({ req, res, status: "RESCHEDULED", requireSchedule: true })
  );

  return router;
}

module.exports = { createAppointmentsRouter };
