# Data-Protection Complaint Procedure

Satisfies the DUAA 2025 duty (in force **19 June 2026**) for UK data
subjects to complain **directly to the controller**, and the equivalent
expectation under EU GDPR. The Privacy Policy (§5, "Right to complain to us
directly") promises acknowledgement within 30 days and a response without
undue delay — this is the workflow that makes that promise real.

## Intake

- **Channel:** `privacy@heelerdigital.com` (already published in Privacy §5
  and §12).
- **Routing:** complaints to this inbox are a tracked queue, not a personal
  mailbox. Every complaint gets a ticket.

## Per-complaint log (keep for evidence)

For each complaint, record:

1. **Received** — timestamp the complaint arrived.
2. **Acknowledged** — timestamp we sent the acknowledgement (target: within
   30 days of receipt; aim for ≤ 5 business days in practice).
3. **Responded** — timestamp of the substantive response, plus outcome.
4. **Escalation** — whether the complainant escalated to a supervisory
   authority (ICO / EU DPA), and any reference number.

## Acknowledgement template

> Thank you for contacting us about your personal data. We've logged your
> complaint (ref: `<TICKET>`) on `<DATE>` and a member of our team is
> reviewing it. We'll respond substantively without undue delay. You can
> also escalate to a data-protection supervisory authority at any time —
> in the UK, the Information Commissioner's Office (ico.org.uk).

## Status

- [ ] Inbox routed to a tracked queue (Jim Cunningham) — **launch-blocking for UK**
- [ ] Acknowledgement template saved as a canned reply (Keenan)
- [ ] Log/ticket fields above captured per complaint (Both)

The policy wording is live; the items above are operational setup, not
code. No deploy depends on them, but the UK duty does.
