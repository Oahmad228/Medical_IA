import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import TopBar from "../components/TopBar";

export default function SuperAdminArea({ session, onLogout }) {
  const token = session.token;
  const [status, setStatus] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [statusCounts, setStatusCounts] = useState({
    PENDING: null,
    ACTIVE: null,
    REJECTED: null,
    BANNED: null,
  });
  const [message, setMessage] = useState("");

  async function loadRequests(nextStatus = status) {
    const data = await api(`/admin/doctor-requests?status=${nextStatus}`, {
      method: "GET",
      token,
    });
    const list = Array.isArray(data) ? data : [];
    setRequests(list);
    setStatusCounts((prev) => ({ ...prev, [nextStatus]: list.length }));
  }

  async function loadStatusCounts() {
    try {
      const statuses = ["PENDING", "ACTIVE", "REJECTED", "BANNED"];
      const results = await Promise.all(
        statuses.map((statusKey) =>
          api(`/admin/doctor-requests?status=${statusKey}`, {
            method: "GET",
            token,
          })
        )
      );
      const nextCounts = statuses.reduce((acc, statusKey, idx) => {
        const list = Array.isArray(results[idx]) ? results[idx] : [];
        acc[statusKey] = list.length;
        return acc;
      }, {});
      setStatusCounts(nextCounts);
    } catch (_error) {
      // ignore stats errors
    }
  }

  async function ban(userId) {
    await api(`/admin/doctor-requests/${userId}/ban`, {
      method: "POST",
      token,
      payload: { note: "Banni par superadmin" },
    });
    setMessage("Medecin banni.");
    await loadRequests();
    await loadStatusCounts();
  }

  async function unban(userId) {
    await api(`/admin/doctor-requests/${userId}/unban`, {
      method: "POST",
      token,
      payload: { note: "Debanni par superadmin" },
    });
    setMessage("Medecin debanni.");
    await loadRequests();
    await loadStatusCounts();
  }

  async function approve(userId) {
    await api(`/admin/doctor-requests/${userId}/approve`, {
      method: "POST",
      token,
      payload: { note: "Valide par superadmin" },
    });
    setMessage("Medecin valide.");
    await loadRequests();
    await loadStatusCounts();
  }

  async function reject(userId) {
    await api(`/admin/doctor-requests/${userId}/reject`, {
      method: "POST",
      token,
      payload: { note: "Informations insuffisantes" },
    });
    setMessage("Medecin rejete.");
    await loadRequests();
    await loadStatusCounts();
  }

  useEffect(() => {
    loadRequests().catch((_error) => setRequests([]));
    loadStatusCounts().catch(() => {});
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
        <section className="panel admin-panel">
          <div className="panel-head admin-head">
            <div>
              <h2>Validation medecins</h2>
              <p className="muted admin-subtitle">
                Gerer les inscriptions des medecins en attente de validation.
              </p>
            </div>
            <label className="admin-filter">
              <span>Statut</span>
              <select
                className="admin-filter__select"
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
                <option value="BANNED">Banned</option>
              </select>
            </label>
          </div>

          <div className="admin-stats">
            <div className="admin-stat admin-stat--pending">
              <span className="admin-stat__label">En attente</span>
              <strong className="admin-stat__value">
                {statusCounts.PENDING ?? "-"}
              </strong>
            </div>
            <div className="admin-stat admin-stat--active">
              <span className="admin-stat__label">Actifs</span>
              <strong className="admin-stat__value">
                {statusCounts.ACTIVE ?? "-"}
              </strong>
            </div>
            <div className="admin-stat admin-stat--rejected">
              <span className="admin-stat__label">Rejetes</span>
              <strong className="admin-stat__value">
                {statusCounts.REJECTED ?? "-"}
              </strong>
            </div>
            <div className="admin-stat admin-stat--rejected">
              <span className="admin-stat__label">Bannis</span>
              <strong className="admin-stat__value">
                {statusCounts.BANNED ?? "-"}
              </strong>
            </div>
          </div>

          {message ? <p className="info-text">{message}</p> : null}

          <div className="requests-list">
            {requests.length === 0 ? (
              <p className="muted">Aucune demande pour ce statut.</p>
            ) : (
              requests.map((request) => {
                const statusKey = request.status?.toLowerCase();

                return (
                  <article key={request.id} className="request-card">
                    <div className="request-main">
                      <div className="request-head">
                        <h3>{request.fullName}</h3>
                        <span className={`request-status request-status--${statusKey}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="request-email">{request.email}</p>
                      <div className="request-meta">
                        <div>
                          <span className="request-meta__label">Specialite</span>
                          <span className="request-meta__value">
                            {request.doctorProfile?.specialty || "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="request-meta__label">Licence</span>
                          <span className="request-meta__value">
                            {request.doctorProfile?.licenseNumber || "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="request-actions">
                      {request.status === "PENDING" ? (
                        <button type="button" onClick={() => approve(request.id)}>
                          Valider
                        </button>
                      ) : null}
                      {request.status === "PENDING" ? (
                        <button type="button" className="ghost" onClick={() => reject(request.id)}>
                          Rejeter
                        </button>
                      ) : null}
                      {request.status === "ACTIVE" ? (
                        <button type="button" className="ghost" onClick={() => ban(request.id)}>
                          Bannir
                        </button>
                      ) : null}
                      {request.status === "BANNED" ? (
                        <button type="button" onClick={() => unban(request.id)}>
                          Debannir
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>
    </>
  );
}
