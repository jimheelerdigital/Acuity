"use client";

import { useEffect, useState } from "react";

/**
 * Admin error boundary. Renders a static error page with no hooks,
 * no data fetching, and no components that could themselves crash.
 * The reset button waits 1 second before re-mounting the page to
 * break any rapid re-render loops.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  // Log the error once
  useEffect(() => {
    console.error("[admin error boundary]", error.message, error.digest);
  }, [error]);

  const handleRetry = () => {
    setRetrying(true);
    // Delay reset to break any rapid crash→mount→crash loops
    setTimeout(() => reset(), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0D17", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ color: "#EF4444", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Dashboard crashed
        </h1>
        <p style={{ color: "#A0A0B8", fontSize: 14, marginBottom: 8 }}>
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p style={{ color: "#666", fontSize: 11, fontFamily: "monospace", marginBottom: 16 }}>
            Digest: {error.digest}
          </p>
        )}
        <p style={{ color: "#666", fontSize: 12, marginBottom: 24 }}>
          Check Vercel function logs for <code style={{ background: "#1a1a2e", padding: "2px 6px", borderRadius: 4 }}>/api/admin/metrics</code>
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            background: retrying ? "#333" : "#7C5CFC",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: retrying ? "wait" : "pointer",
            opacity: retrying ? 0.5 : 1,
          }}
        >
          {retrying ? "Retrying..." : "Retry"}
        </button>
        <div style={{ marginTop: 16 }}>
          <a href="/home" style={{ color: "#7C5CFC", fontSize: 13, textDecoration: "none" }}>
            Back to app
          </a>
        </div>
      </div>
    </div>
  );
}
