import React from "react";

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <div className="app-footer__brand">
          <div className="app-footer__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v16M4 12h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <p className="app-footer__title">Medical AI</p>
            <p className="app-footer__tagline">Assistant clinique securise</p>
          </div>
        </div>
        <div className="app-footer__links">
          <span>Confidentialite</span>
          <span className="app-footer__sep">•</span>
          <span>Conditions</span>
          <span className="app-footer__sep">•</span>
          <a href="mailto:support@medical-ai.app">support@medical-ai.app</a>
        </div>
      </div>
      <div className="app-footer__meta">
        <span>© {new Date().getFullYear()} Medical AI</span>
        <span>Systeme clinique</span>
      </div>
    </footer>
  );
}
