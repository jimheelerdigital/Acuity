/**
 * Legendary Mythicals quiz + product-interest readout (2026-10-27).
 *
 *   npx tsx scripts/mythicals-quiz-stats.ts            # since launch
 *   npx tsx scripts/mythicals-quiz-stats.ts 2026-10-27 # since a date
 *
 * Reads the site's own event log (mythicals-data bucket). It does not filter
 * our own visits, so expect a few test runs in small numbers.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "..", ".env.local") });
config({ path: resolve(__dirname, "../../..", ".env"), override: true });

import { createClient } from "@supabase/supabase-js";

type Ev = { t: string; type: string; quiz?: string; slug?: string; products?: string[]; source?: string; own?: boolean; ref?: string };

async function main() {
  const since = process.argv[2] ?? "2000-01-01";
  const st = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from("mythicals-data");
  const { data: files } = await st.list("mythicals-site/events", { limit: 1000 });
  const events: Ev[] = [];
  for (const f of files ?? []) {
    if (f.name.slice(0, 10) < since) continue;
    const { data } = await st.download(`mythicals-site/events/${f.name}`);
    for (const l of (await data!.text()).split("\n")) if (l.trim()) events.push(JSON.parse(l));
  }
  const quizOf = (e: Ev) => e.quiz ?? "beast";
  const count = (pred: (e: Ev) => boolean) => events.filter(pred).length;

  console.log(`Legendary Mythicals since ${since}: ${count((e) => e.type === "page_view")} page views\n`);
  for (const quiz of ["beast", "armor", "weapon"]) {
    const starts = count((e) => e.type === "quiz_start" && quizOf(e) === quiz);
    const done = events.filter((e) => e.type === "quiz_complete" && quizOf(e) === quiz);
    const results = new Map<string, number>();
    for (const e of done) results.set(e.slug ?? "?", (results.get(e.slug ?? "?") ?? 0) + 1);
    const top = [...results.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} ${n}`).join(", ");
    console.log(`${quiz.toUpperCase()}: ${starts} started, ${done.length} finished${starts ? ` (${Math.round((done.length / starts) * 100)}%)` : ""}${top ? ` | top: ${top}` : ""}`);
  }

  const answers = events.filter((e) => e.type === "product_interest");
  const said = answers.filter((e) => (e.products ?? []).length > 0);
  const tally = new Map<string, number>();
  for (const e of said) for (const p of e.products ?? []) tally.set(p, (tally.get(p) ?? 0) + 1);
  const waitlist = events.filter((e) => e.type === "signup" && e.source === "product_waitlist");
  const wl = new Map<string, number>();
  for (const e of waitlist) for (const p of e.products ?? []) wl.set(p, (wl.get(p) ?? 0) + 1);

  console.log(`\nPRODUCT QUESTION: ${answers.length} answered, ${said.length} picked something, ${answers.length - said.length} said none`);
  for (const [p, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(12)} ${String(n).padStart(4)} picks (${Math.round((n / Math.max(1, said.length)) * 100)}% of pickers)   ${wl.get(p) ?? 0} joined the waitlist`);
  }
  console.log(`\nWAITLIST: ${waitlist.length} signups (${said.length ? Math.round((waitlist.length / said.length) * 100) : 0}% of pickers left an email)`);
  console.log(`Other email signups: ${count((e) => e.type === "signup" && e.source !== "product_waitlist")}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
