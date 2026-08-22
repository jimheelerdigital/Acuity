/**
 * Magic-link confirmation interstitial (P1 auth hardening).
 *
 * The magic-link email points HERE, not at NextAuth's `/api/auth/callback/email`
 * (which consumes the single-use token on GET — an email-security scanner that
 * prefetches the link would burn it). This page renders a plain form and
 * consumes NOTHING on load; the token is only consumed when the user clicks
 * "Confirm sign-in", which POSTs to /api/auth/magic-confirm → the real callback.
 * No client JS + no auto-submit, so a prefetch can't trip it. Mirrors the mobile
 * /auth/mobile-complete flow.
 */

export const dynamic = "force-dynamic";

export default function ConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string; email?: string; callbackUrl?: string };
}) {
  const token = searchParams.token ?? "";
  const email = searchParams.email ?? "";
  const callbackUrl = searchParams.callbackUrl ?? "/";
  const valid = Boolean(token && email);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#15131D",
        padding: "24px",
        fontFamily: "-apple-system, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#211f2b",
          borderRadius: 16,
          padding: "32px 28px",
          color: "#EDEBF2",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Confirm sign-in</h1>
        {valid ? (
          <>
            <p style={{ color: "#B7B3C4", fontSize: 15, margin: "0 0 24px" }}>
              Finish signing in to Ripple as <strong>{email}</strong>.
            </p>
            <form method="POST" action="/api/auth/magic-confirm">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "#F2895E",
                  color: "#1A1622",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirm sign-in
              </button>
            </form>
            <p style={{ color: "#8A8698", fontSize: 12.5, margin: "20px 0 0" }}>
              This link works once and expires soon. If you didn’t request it, you
              can safely close this page.
            </p>
          </>
        ) : (
          <p style={{ color: "#B7B3C4", fontSize: 15, margin: 0 }}>
            This sign-in link is invalid or incomplete. Please request a new one
            from the sign-in page.
          </p>
        )}
      </div>
    </main>
  );
}
