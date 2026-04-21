"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Next.js global error boundary. Fires when a render error escapes
 * every narrower boundary. Reports to Sentry and renders a friendly
 * branded fallback with the eventId so the user can reference it if
 * they contact support.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Grab the last event id so we can show a correlation handle.
  const eventId =
    typeof window !== "undefined" ? Sentry.lastEventId() : undefined;

  return (
    <html>
      <body style={{ margin: 0, background: "#0B0B12", color: "#FAFAFA" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
                borderRadius: 12,
                margin: "0 auto 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}
            >
              ✦
            </div>
            <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>
              Something went wrong on our end.
            </h1>
            <p
              style={{
                color: "#A1A1AA",
                fontSize: 15,
                lineHeight: 1.6,
                margin: "0 0 20px",
              }}
            >
              We&rsquo;ve been notified and are looking into it. Try
              refreshing — if it keeps happening, reach out and quote the
              reference below.
            </p>
            {eventId && (
              <p
                style={{
                  color: "#52525B",
                  fontSize: 12,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  margin: "0 0 24px",
                }}
              >
                Ref: {eventId}
              </p>
            )}
            <a
              href="/"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
                color: "#FFFFFF",
                padding: "12px 20px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to Acuity
            </a>
            {/* Silence the eslint-unused warning without extra scope */}
            <div style={{ display: "none" }}>
              <NextError statusCode={500} />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
