/**
 * Custom Pages Router _error page.
 *
 * Next.js auto-generates a Pages Router _error.js even in App Router
 * projects. During static export on Vercel, the auto-generated version
 * fails because Sentry's withSentryConfig wrapper injects code that
 * requires runtime context unavailable during static rendering.
 *
 * This explicit _error page is trivially renderable so static export
 * of /404 and /500 never fails. The App Router's not-found.tsx and
 * global-error.tsx handle the actual error UI.
 */

import type { NextPageContext } from "next";

function ErrorPage({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 48, fontWeight: 700, color: "#18181b", margin: 0 }}>{statusCode || "Error"}</h1>
        <p style={{ fontSize: 16, color: "#71717a", marginTop: 8 }}>
          {statusCode === 404 ? "This page could not be found." : "An error occurred."}
        </p>
        <a href="/" style={{ display: "inline-block", marginTop: 24, color: "#8E6FE6", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          Go home
        </a>
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
