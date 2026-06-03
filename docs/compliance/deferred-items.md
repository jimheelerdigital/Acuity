# Compliance — Deferred Items

Items identified in the June 3, 2026 Privacy/Terms compliance review that
are **intentionally deferred**, with the trigger that should pull each back
into scope. Everything else from that review's "Critical" and "Important"
lists shipped in the v1.4 GDPR slice (2026-06-03).

---

## Art. 27 UK & EU representative — DEFERRED

**Review refs:** 1.1 (Critical), and the representative block A1 in the
drop-in TSX corrections.

**What it is.** As a US controller (Heeler Digital, LLC, Massachusetts)
offering the service to UK and EU residents without being established
there, UK GDPR Art. 27 and EU GDPR Art. 27 generally require us to appoint
a written representative in each region and disclose them in the Privacy
Policy.

**Why deferred.** At current volume the cost/benefit and the narrow
Art. 27(2) posture don't yet justify the recurring spend and the
publication of in-region representative details. We are documenting the
decision and the trigger rather than appointing now.

### Trigger — appoint as soon as EITHER threshold is crossed

- **100+ active EU/UK users**, OR
- **€1,000 / month of EU/UK-attributable revenue.**

When either is hit:

1. Appoint a representative-as-a-service provider in **each** of the UK and
   the EU (a few hundred £/€ per year each).
2. Paste their name + in-region address + contact email into the Privacy
   Policy intro block (the "UK & EU representatives" paragraph from the
   review's drop-in A1) and Section 12.
3. Bump `LAST_UPDATED` on `/privacy` and the `CURRENT_POLICY_VERSION` in
   `apps/web/src/lib/consent.ts`.

**Owner:** Jim Cunningham (legal/vendor) + Keenan (revenue threshold monitoring).

**Until appointed this is a known, accepted gap.** Re-check at each
material increase in EU/UK traffic or revenue.

---

## Notes on adjacent items that DID ship

- The DUAA "right to complain to the controller" wording shipped in Privacy
  §5. The **operational intake** behind it (route `privacy@heelerdigital.com`
  to a tracked queue, log receipt/acknowledgement/response timestamps,
  template an acknowledgement reply within 30 days) is an ops task, not
  code — see `docs/compliance/complaint-procedure.md`.
- DPF transfer-mechanism claims were reduced to **SCCs + UK IDTA** for every
  US importer except Google/Meta/Apple (verifiably DPF-certified). Each
  remaining importer must still be checked against
  `dataprivacyframework.gov/list`; add `+ DPF` to its row only once
  certification is confirmed. Tracked in `docs/compliance/subprocessors.md`.
