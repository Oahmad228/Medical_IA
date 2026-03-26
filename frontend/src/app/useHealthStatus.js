import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * [Module: src/app/useHealthStatus.js] useHealthStatus
 * Fetches backend health once at app start.
 */
export function useHealthStatus() {
  const [health, setHealth] = useState({ label: "Backend: verification...", state: "idle" });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await api("/health", { method: "GET" });
        if (active) {
          setHealth({ label: `Backend: en ligne (${data.aiMode})`, state: "ok" });
        }
      } catch (_error) {
        if (active) {
          setHealth({ label: "Backend: hors ligne", state: "down" });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return health;
}
