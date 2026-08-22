# Paste this into Claude Code

I'm rebuilding the Acuity marketing home page (getacuity.io → acuity.io, Next.js)
to match our newly refreshed app design system. A complete, working design
reference is in `marketing_handoff/`. Follow it for pixel fidelity.

Do these in order — don't start coding before step 3:

1. Open `marketing_handoff/README.md` and read it fully. Then open
   `marketing_handoff/Marketing Home.html` in a browser to see the target, and read
   `marketing_handoff/marketing.jsx` to see how every section is built.

2. Read `marketing_handoff/acuity-tokens.jsx`. This is our design system —
   `makeAcuityTokens()` returns every color, gradient, shadow, font, and motion
   token in oklch. Tell me how you'll port it into THIS repo (CSS variables,
   Tailwind theme, etc.) so light/dark + the 4 accent palettes all derive from one
   source. Don't hardcode hex values anywhere.

3. Propose the production component structure for the page (Nav, Hero, HowItWorks,
   FeatureRow ×3, Consistency/Badges, Pricing, FinalCTA, Footer) and how it slots
   into our existing Next.js marketing app. Wait for my OK.

4. Then build it section by section, diffing against `Marketing Home.html` in both
   light and dark mode until it matches.

Important constraints:
- Dark mode is warm lifted charcoal, NOT purple-black. Match the tokens exactly.
- The phone mockups are the REAL app screens (`screen-*.jsx` + `acuity-chrome.jsx`).
  Reuse our app component library or pre-render them — do not redraw by hand.
- Copy, the 4.9 rating, and feature bullets are placeholders — leave a TODO to swap
  in real values; don't invent stats.
- Keep/re-apply our existing marketing animations where appropriate; the reference's
  scroll-reveal is a baseline, not a replacement.
- $4.99/mo, 14-day trial is correct (matches the live site).

Start with step 1.
