import { Resend } from 'resend';

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

type SendPayload = Parameters<Resend["emails"]["send"]>[0];

/**
 * Send via Resend and THROW if the API returned an error. The SDK does
 * not throw on API errors ({ data, error } return) — ignoring `error`
 * once hid a month of 403s (see PROGRESS.md 2026-09-23). Use this
 * instead of calling resend.emails.send directly.
 */
export async function sendEmailOrThrow(payload: SendPayload) {
  const resp = await getResendClient().emails.send(payload);
  if (resp.error) {
    throw new Error(`[resend] ${resp.error.name}: ${resp.error.message}`);
  }
  return resp.data;
}
