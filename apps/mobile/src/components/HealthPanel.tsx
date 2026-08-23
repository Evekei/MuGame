"use client";

import type { HealthResponse } from "@mugame/contracts/health";
import { useEffect, useState } from "react";
import { readHealth } from "@/features/health/healthService";
import { ApiClientError } from "@/lib/api/client";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; data: HealthResponse }
  | { status: "error"; message: string };

export function HealthPanel() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    readHealth()
      .then((data) => {
        if (active) {
          setHealth({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        const message =
          error instanceof ApiClientError
            ? error.message
            : "Unable to reach the API.";
        setHealth({ status: "error", message });
      });

    return () => {
      active = false;
    };
  }, []);

  if (health.status === "loading") {
    return <div className="health">Checking API health...</div>;
  }

  if (health.status === "error") {
    return <div className="health">API health unavailable: {health.message}</div>;
  }

  return (
    <div className="health">
      <div className="health-row">
        <span>Status</span>
        <strong>{health.data.status}</strong>
      </div>
      <div className="health-row">
        <span>Version</span>
        <strong>{health.data.version}</strong>
      </div>
      <div className="health-row">
        <span>Server time</span>
        <strong>{health.data.server_time}</strong>
      </div>
    </div>
  );
}
