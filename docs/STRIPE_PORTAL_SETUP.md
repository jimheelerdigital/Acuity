# Stripe Customer Portal — configuration checklist

## Code status (verified 2026-04-21)

The portal flow is **wired end-to-end** — no code changes required. Verified live at:

- **Route:** `apps/web/src/app/api/stripe/portal/route.ts` — POST creates a `billingPortal.sessions.create({ customer, return_url })` and returns `{ url }`. Returns 400 with `redirect: "/upgrade"` for users without a `stripeCustomerId`.
- **UI:** `apps/web/src/app/account/account-client.tsx:458` calls the route and follows the returned URL. Shown as the "Manage subscription" button in the Subscription section (line 535), visible when the user has a stripeCustomerId. Users without one see an "Upgrade" link instead.
- **Return URL:** `${NEXT_PUBLIC_APP_URL || NEXTAUTH_URL || https://www.getacuity.io}/account?portal=returned`. The query param is currently cosmetic — no logic branches on it, but it's stable for future use (toast, refresh).

No billing-portal-related code ships in the mobile app; mobile users deep-link out to `${appUrl}/upgrade?src=mobile_profile` which renders the web account page after sign-in.

## Jim's manual configuration — Stripe Dashboard (one-time)

Do this in **live** AND **test** modes separately.

1. **Activate the portal.**
   - Stripe Dashboard → Settings → Billing → [Customer portal](https://dashboard.stripe.com/settings/billing/portal).
   - Toggle **"Enable customer portal"** on.

2. **Business branding (so the portal doesn't feel generic).**
   - Logo: upload Acuity logo.
   - Icon / Accent color: `#7C5CFC` (Acuity brand purple) — or leave at Stripe default if we're not ready to style.
   - Privacy policy URL: `https://www.getacuity.io/privacy`.
   - Terms of service URL: `https://www.getacuity.io/terms`.

3. **Features — Customer information.**
   - Allow customers to update: **email**, **billing address**, **payment method** → ON.
   - Shipping address / phone number → OFF (we don't use them).

4. **Features — Subscriptions.**
   - Cancellation → **Immediately at end of billing period** (soft cancel; the user keeps PRO access through `stripeCurrentPeriodEnd`, which our webhook mirrors onto `subscriptionStatus`).
   - Cancellation reasons: enable and include at least: "Too expensive", "Not using enough", "Missing a feature", "Switching to another product", "Other". Surface in Stripe's dashboard for churn analysis.
   - Proration: **Create invoice prorations** (default).
   - Plan changes: disable for now — we only have one plan. Re-enable when a second SKU lands (if ever).

5. **Features — Invoice history.**
   - Allow customers to view past invoices → ON.

6. **Features — Payment methods.**
   - Allow adding / removing payment methods → ON.
   - Default payment method update → ON.

7. **Return to business URL.**
   - `https://www.getacuity.io/account?portal=returned`. The route in code generates this from env vars, but Stripe's own "Return to business" label uses the value you configure here if set.

8. **Test the full loop.**
   - In test mode, create a throwaway Checkout → make a test subscription → open `/account` → click **Manage subscription** → verify portal opens in Stripe's hosted UI with the branding applied → cancel → return → verify `/account` reflects the new state once the `customer.subscription.updated` webhook processes.

## Webhook prerequisites (already shipped in code)

Webhook events that MUST route to `https://www.getacuity.io/api/stripe/webhook`:

- `checkout.session.completed` (sets `subscriptionStatus = "PRO"`)
- `customer.subscription.updated` (mirrors granular Stripe status → our PRO / PAST_DUE / FREE vocab)
- `customer.subscription.deleted` (cancel-at-period-end and explicit cancel)
- `invoice.payment_failed` (flips to PAST_DUE + sends the soft-tone Resend nudge)

Configure these at Stripe Dashboard → Developers → Webhooks → Add endpoint. Signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel production env. Already set per PROGRESS.md (`ee1f6e5` commit).

## Known gaps (non-blocking for beta)

- **Cancellation reasons** aren't imported into our admin — Stripe dashboard is the viewer for now. Post-beta, pull via the Stripe API into an admin Revenue tab widget if Keenan wants it.
- **Family / team plans** — not relevant; single-seat SaaS. If we ever launch a team SKU, portal's "manage members" feature lights up with no code change.
- **Mobile** — intentionally routes to the web portal via `?src=mobile_profile`. Apple IAP would bypass the portal entirely; decision deferred per `docs/APPLE_IAP_DECISION.md`.
