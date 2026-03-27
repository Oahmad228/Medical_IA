import React, { useEffect, useRef, useState } from "react";

export default function TopBar({
  subtitle,
  userName,
  onLogout,
  onOpenSettings,
  onOpenAppointments,
  showAppointments = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v18"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M9.2 6.4c2.2-1.3 4.9-.9 6.4.9 1.2 1.5 1.2 3.6 0 5.1-1.1 1.4-3.2 2-5.1 1.3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="9" cy="6.2" r="1.3" fill="currentColor" />
          </svg>
        </div>
        <div>
          <p className="topbar-brand-name">Medical AI</p>
          {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="topbar-actions">
        <div className="topbar-user">{userName}</div>
        <div className="topbar-actions-group">
          {showAppointments && typeof onOpenAppointments === "function" ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Ouvrir les reservations"
              onClick={onOpenAppointments}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="4"
                  y="5"
                  width="16"
                  height="15"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M8 3v4M16 3v4M4 9h16" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M8.2 13.4h4.2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
          {typeof onOpenSettings === "function" ? (
            <div className="topbar-menu" ref={menuRef}>
              <button
                type="button"
                className="icon-button"
                aria-label="Parametres du compte"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M4 12l2.1-.4a6.8 6.8 0 011.1-2.6l-1.2-1.8 1.8-1.8 1.8 1.2a6.8 6.8 0 012.6-1.1L12 4l.4 2.1a6.8 6.8 0 012.6 1.1l1.8-1.2 1.8 1.8-1.2 1.8a6.8 6.8 0 011.1 2.6L20 12l-2.1.4a6.8 6.8 0 01-1.1 2.6l1.2 1.8-1.8 1.8-1.8-1.2a6.8 6.8 0 01-2.6 1.1L12 20l-.4-2.1a6.8 6.8 0 01-2.6-1.1l-1.8 1.2-1.8-1.8 1.2-1.8a6.8 6.8 0 01-1.1-2.6L4 12z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {menuOpen ? (
                <div className="topbar-menu-panel">
                  <button
                    type="button"
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSettings?.("profile");
                    }}
                  >
                    Modifier mes infos
                  </button>
                  <button
                    type="button"
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSettings?.("password");
                    }}
                  >
                    Changer le mot de passe
                  </button>
                  <button
                    type="button"
                    className="topbar-menu-item danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSettings?.("delete");
                    }}
                  >
                    Supprimer mon compte
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="ghost" type="button" onClick={onLogout}>
            Deconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
