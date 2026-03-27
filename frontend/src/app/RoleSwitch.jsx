import React from "react";
import PatientArea from "../areas/PatientArea";
import DoctorArea from "../areas/DoctorArea";
import SuperAdminArea from "../areas/SuperAdminArea";

/**
 * [Module: src/app/RoleSwitch.jsx] RoleSwitch
 * Routes the user to the correct area based on their role.
 */
export default function RoleSwitch({ role, session, health, onLogout, onSessionUpdate }) {
  if (role === "SUPERADMIN") {
    return (
      <SuperAdminArea
        session={session}
        health={health}
        onLogout={onLogout}
        onSessionUpdate={onSessionUpdate}
      />
    );
  }

  if (role === "DOCTOR") {
    return (
      <DoctorArea
        session={session}
        health={health}
        onLogout={onLogout}
        onSessionUpdate={onSessionUpdate}
      />
    );
  }

  return (
    <PatientArea
      session={session}
      health={health}
      onLogout={onLogout}
      onSessionUpdate={onSessionUpdate}
    />
  );
}
