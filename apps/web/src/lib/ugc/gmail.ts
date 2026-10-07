/**
 * Gmail for UGC outreach: sends from Keenan's own Workspace mailbox
 * (OUTREACH_FROM_EMAIL, heelerdigital.com runs on Google Workspace) and
 * checks threads for replies. NEVER Resend, never goripple.io — Resend stays
 * for product emails and Keenan's internal digest.
 *
 * Scopes: gmail.send (send only) + gmail.metadata (headers only: enough to
 * see that a reply arrived, can't read bodies). Keenan connects once at
 * /admin/ugc → "Connect Gmail"; the refresh token is stored encrypted
 * (lib/calendar/encryption.ts) in UgcMailbox.
 *
 * OAuth client: GMAIL_OUTREACH_CLIENT_ID/SECRET (an Internal-type client in
 * the Heeler Digital Workspace, so no Google verification), falling back to
 * GOOGLE_CLIENT_ID/SECRET. Redirect URI to register on the client:
 *   https://goripple.io/api/admin/ugc/gmail/callback
 * Same signed-state pattern as lib/calendar/oauth.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { google, type Auth } from "googleapis";

import { decryptToken, encryptToken } from "@/lib/calendar/encryption";
import { OUTREACH_FROM_EMAIL } from "@/lib/ugc/config";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.metadata",
];

const STATE_TTL_MS = 10 * 60 * 1000;

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "https://goripple.io";
  return `${base.replace(/\/$/, "")}/api/admin/ugc/gmail/callback`;
}

export function gmailOAuthClient(): Auth.OAuth2Client {
  const id = process.env.GMAIL_OUTREACH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GMAIL_OUTREACH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("ugc/gmail: no Google OAuth client configured");
  return new google.auth.OAuth2(id, secret, redirectUri());
}

function stateSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("ugc/gmail: no secret for OAuth state");
  return s;
}

export function signState(adminUserId: string): string {
  const payload = `${adminUserId}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  const sig = createHmac("sha256", stateSecret()).update(`ugc-gmail:${payload}`).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string, adminUserId: string): boolean {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const parts = raw.split(".");
    if (parts.length !== 4) return false;
    const [uid, ts, nonce, sig] = parts;
    const expected = createHmac("sha256", stateSecret()).update(`ugc-gmail:${uid}.${ts}.${nonce}`).digest("hex").slice(0, 32);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    return uid === adminUserId && Date.now() - Number(ts) < STATE_TTL_MS;
  } catch {
    return false;
  }
}

export function buildGmailAuthUrl(state: string): string {
  return gmailOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    login_hint: OUTREACH_FROM_EMAIL,
    state,
  });
}

/** Exchange the code, check it's the outreach mailbox, store the token. */
export async function completeGmailConnect(code: string): Promise<string> {
  const client = gmailOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google returned no refresh token — remove the app's access and connect again");
  client.setCredentials(tokens);
  const info = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const email = (info.data.email ?? "").toLowerCase();
  if (email !== OUTREACH_FROM_EMAIL.toLowerCase()) {
    throw new Error(`Connected ${email || "unknown"}, but outreach must send from ${OUTREACH_FROM_EMAIL}`);
  }
  const { prisma } = await import("@/lib/prisma");
  await prisma.ugcMailbox.upsert({
    where: { email },
    create: { email, refreshTokenEnc: encryptToken(tokens.refresh_token), scopes: tokens.scope ?? "" },
    update: { refreshTokenEnc: encryptToken(tokens.refresh_token), scopes: tokens.scope ?? "", connectedAt: new Date() },
  });
  return email;
}

export async function mailboxStatus(): Promise<{ connected: boolean; email: string | null; connectedAt: Date | null }> {
  if (!OUTREACH_FROM_EMAIL) return { connected: false, email: null, connectedAt: null };
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.ugcMailbox.findUnique({ where: { email: OUTREACH_FROM_EMAIL.toLowerCase() } });
  return { connected: !!row, email: row?.email ?? null, connectedAt: row?.connectedAt ?? null };
}

async function authedGmail() {
  if (!OUTREACH_FROM_EMAIL) throw new Error("OUTREACH_FROM_EMAIL is empty — refusing to send");
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.ugcMailbox.findUnique({ where: { email: OUTREACH_FROM_EMAIL.toLowerCase() } });
  const refresh = row ? decryptToken(row.refreshTokenEnc) : null;
  if (!refresh) throw new Error(`Gmail not connected for ${OUTREACH_FROM_EMAIL}`);
  const client = gmailOAuthClient();
  client.setCredentials({ refresh_token: refresh });
  return google.gmail({ version: "v1", auth: client });
}

/** RFC 2822 plain-text message, base64url. No HTML, no tracking. */
export function buildRawMessage(m: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}): string {
  const subject = /^[\x20-\x7e]*$/.test(m.subject)
    ? m.subject
    : `=?UTF-8?B?${Buffer.from(m.subject, "utf8").toString("base64")}?=`;
  const headers = [
    `From: Keenan <${m.from}>`,
    `To: ${m.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${m.body.replace(/\r?\n/g, "\r\n")}`, "utf8").toString("base64url");
}

export async function sendGmail(m: {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}): Promise<{ id: string; threadId: string; messageIdHeader: string | null }> {
  const gmail = await authedGmail();
  const raw = buildRawMessage({ from: OUTREACH_FROM_EMAIL, ...m });
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, ...(m.threadId ? { threadId: m.threadId } : {}) },
  });
  const id = res.data.id!;
  const meta = await gmail.users.messages
    .get({ userId: "me", id, format: "metadata", metadataHeaders: ["Message-ID"] })
    .catch(() => null);
  const header = meta?.data.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? null;
  return { id, threadId: res.data.threadId!, messageIdHeader: header };
}

/** First message in the thread NOT from us, or null. */
export async function threadReplyAt(threadId: string): Promise<Date | null> {
  const gmail = await authedGmail();
  const t = await gmail.users.threads.get({ userId: "me", id: threadId, format: "metadata", metadataHeaders: ["From"] });
  for (const msg of t.data.messages ?? []) {
    const from = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    if (!from.toLowerCase().includes(OUTREACH_FROM_EMAIL.toLowerCase())) {
      return new Date(Number(msg.internalDate ?? Date.now()));
    }
  }
  return null;
}
