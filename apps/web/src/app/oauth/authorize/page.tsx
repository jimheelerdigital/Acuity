/**
 * /oauth/authorize — the "Sign in with Ripple" consent screen.
 *
 * Claude (or another MCP client) sends the user here after registering
 * itself. We validate the request, make sure the user is signed in (bounce
 * through /auth/signin and back), check they have Pro (the MCP server is a
 * Pro feature), and show what the app will be able to read. Approve/Cancel
 * go through /api/oauth/authorize, which issues a single-use code bound to
 * this exact request.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { Card } from "@/components/acuity";
import { getAuthOptions } from "@/lib/auth";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import {
  buildClientRedirect,
  mcpResourceUrl,
  oauthIssuer,
  parseAuthorizeRequest,
  signConsentTicket,
} from "@/lib/mcp-oauth/core";
import { checkClientAndRedirect } from "@/lib/mcp-oauth/server";

import { ConsentButtons } from "./consent-buttons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect to Ripple",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-acuity-bg text-acuity-text flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <Card>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-acuity-text-sec">{body}</p>
      </Card>
    </Shell>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") q.set(k, v);
  }

  const parsed = parseAuthorizeRequest(q, mcpResourceUrl());
  if (!parsed.ok && !parsed.redirectable) {
    return <ErrorCard title="This connection link isn't valid" body={parsed.message} />;
  }

  const clientId = parsed.ok ? parsed.params.clientId : parsed.clientId;
  const redirectUri = parsed.ok ? parsed.params.redirectUri : parsed.redirectUri;
  const client = await checkClientAndRedirect(clientId, redirectUri);
  if (!client) {
    return (
      <ErrorCard
        title="This app isn't recognised"
        body="The app trying to connect isn't registered with Ripple, or its return address doesn't match. Remove the connector in your AI app and add it again."
      />
    );
  }

  if (!parsed.ok) {
    redirect(
      buildClientRedirect(redirectUri, {
        error: parsed.error,
        error_description: parsed.description,
        state: parsed.state,
        iss: oauthIssuer(),
      })
    );
  }

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/oauth/authorize?${q.toString()}`)}`);
  }
  const userId = session.user.id;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return <ErrorCard title="Something went wrong" body="Ripple sign-in isn't configured. Try again later." />;
  }
  const ticket = signConsentTicket({ ...parsed.params, userId }, secret);

  const resolved = await resolveEntitlement(userId);
  const isPro = !!resolved?.entitlement.canExtractEntries;
  const appName = client.clientName ?? "An app";
  let returnHost = redirectUri;
  try {
    returnHost = new URL(redirectUri).host || redirectUri;
  } catch {
    /* keep raw */
  }

  return (
    <Shell>
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-acuity-text-sec">
          Connect to Ripple
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          {appName} wants to read your Ripple journal
        </h1>
        <p className="mt-1 text-sm text-acuity-text-sec">
          Signed in as {session.user.email ?? "your account"}
        </p>

        {isPro ? (
          <>
            <ul className="mt-5 space-y-2 text-sm text-acuity-text">
              <li>• Search your entries and read their summaries</li>
              <li>• See your themes, tasks, goals, habits and weekly summaries</li>
              <li>• Read-only: it can&apos;t change or delete anything</li>
            </ul>
            <p className="mt-4 text-xs text-acuity-text-sec">
              You can disconnect any time from Account → Connect your AI. You&apos;ll
              return to <span className="font-mono">{returnHost}</span>.
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-acuity-lg border border-acuity-line bg-acuity-bg-sub p-4 text-sm text-acuity-text">
            Connecting your own AI is a Ripple Pro feature.{" "}
            <a href="/upgrade?src=mcp_connect" className="font-semibold text-acuity-primary hover:underline">
              See Pro →
            </a>
          </p>
        )}

        <ConsentButtons ticket={ticket} canApprove={isPro} appName={appName} />
      </Card>
    </Shell>
  );
}
