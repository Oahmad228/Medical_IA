import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import TopBar from "../components/TopBar";

export default function SuperAdminArea({ session, onLogout }) {
  const token = session.token;
  const [status, setStatus] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");

  async function loadRequests(nextStatus = status) {
    const data = await api(`/admin/doctor-requests?status=${nextStatus}`, {
      method: "GET",
      token,
    });
    setRequests(data);
  }

  async function approve(userId) {
    await api(`/admin/doctor-requests/${userId}/approve`, {
      method: "POST",
      token,
      payload: { note: "Valide par superadmin" },
    });
    setMessage("Medecin valide.");
    await loadRequests();
  }

  async function reject(userId) {
    await api(`/admin/doctor-requests/${userId}/reject`, {
      method: "POST",
      token,
      payload: { note: "Informations insuffisantes" },
    });
    setMessage("Medecin rejete.");
    await loadRequests();
  }

  useEffect(() => {
    loadRequests().catch((_error) => setRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <TopBar
        subtitle="Espace Superadmin"
        userName={session.user.fullName}
        onLogout={onLogout}
      />

      <main className="admin-shell">
        <section className="panel">
          <div className="panel-head">
            <h2>Validation medecins</h2>
            <select
              value={status}
              onChange={async (e) => {
                const next = e.target.value;
                setStatus(next);
                await loadRequests(next);
              }}
            >
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {message ? <p className="info-text">{message}</p> : null}

          <div className="requests-list">
            {requests.length === 0 ? (
              <p className="muted">Aucune demande pour ce statut.</p>
            ) : (
              requests.map((request) => (
                <article key={request.id} className="request-card">
                  <div>
                    <h3>{request.fullName}</h3>
                    <p>{request.email}</p>
                    <p>Specialite: {request.doctorProfile?.specialty || "N/A"}</p>
                    <p>Licence: {request.doctorProfile?.licenseNumber || "N/A"}</p>
                    <p>Statut: {request.status}</p>
                  </div>
                  <div className="request-actions">
                    <button type="button" onClick={() => approve(request.id)}>
                      Valider
                    </button>
                    <button type="button" className="ghost" onClick={() => reject(request.id)}>
                      Rejeter
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}
