import React from "react";

export default function TopBar({ title, subtitle, health, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <p className="kicker">Medical AI</p>
        <h1>{title}</h1>
        <p className="topbar-subtitle">{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className={`health-pill ${health.state}`} title="Etat du service API">
          {health.label}
        </span>
        <button
          className="ghost"
          type="button"
          onClick={onLogout}
          aria-label="Se deconnecter"
        >
          Deconnexion
        </button>
      </div>
    </header>
  );
}
