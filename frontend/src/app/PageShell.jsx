import React from "react";
import AppFooter from "../components/AppFooter";

/**
 * [Module: src/app/PageShell.jsx] PageShell
 * Provides the shared background and layout shell for the app.
 */
export default function PageShell({ children }) {
  return (
    <div className="page-shell">
      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />
      <div className="page-content">{children}</div>
      <AppFooter />
    </div>
  );
}
