"use client";

/**
 * Client controls for the creator-platform admin (2026-10-22). Every action
 * posts to /api/admin/creators/action. Money-moving buttons need a second
 * click ("Confirm") — never a browser dialog.
 */
import { useState } from "react";

export const BTN = "px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50";
export const TONES: Record<string, string> = {
  go: "bg-emerald-600 hover:bg-emerald-500 text-white",
  plain: "bg-acuity-bg-inset hover:bg-acuity-card-bg",
  stop: "bg-zinc-600 hover:bg-zinc-500 text-white",
  warn: "bg-amber-600 hover:bg-amber-500 text-white",
};
export const INPUT = "rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1 text-sm";

type Resp = { ok?: boolean; error?: string; result?: unknown };

async function post(body: Record<string, unknown>): Promise<Resp> {
  const res = await fetch("/api/admin/creators/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

const usd = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** One button → one action. `confirm` arms a second click. */
export function ActionButton({
  body,
  label,
  tone = "plain",
  confirm,
}: {
  body: Record<string, unknown>;
  label: string;
  tone?: keyof typeof TONES;
  confirm?: boolean;
}) {
  const [state, setState] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setState("…");
    const r = await post(body);
    setBusy(false);
    setArmed(false);
    if (r.error) setState(r.error);
    else {
      setState("Done");
      window.location.reload();
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} onClick={go} className={`${BTN} ${armed ? TONES.warn : TONES[tone]}`}>
        {armed ? `Confirm: ${label}` : label}
      </button>
      {armed && (
        <button className="text-xs underline text-acuity-text-ter" onClick={() => setArmed(false)}>
          cancel
        </button>
      )}
      {state && <span className="text-xs text-acuity-text-ter">{state}</span>}
    </span>
  );
}

/**
 * A small inline form: text inputs (name → placeholder) + submit. Values are
 * merged into `body`. Required fields must be non-empty.
 */
export function FormAction({
  body,
  fields,
  label,
  tone = "plain",
  confirm,
  required = [],
}: {
  body: Record<string, unknown>;
  fields: Array<{ name: string; placeholder: string; width?: string; type?: string; initial?: string }>;
  label: string;
  tone?: keyof typeof TONES;
  confirm?: boolean;
  required?: string[];
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]))
  );
  const [state, setState] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  async function go() {
    const missing = required.filter((k) => !vals[k]?.trim());
    if (missing.length) return setState(`Required: ${missing.join(", ")}`);
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    setState("…");
    const r = await post({ ...body, ...vals });
    setArmed(false);
    if (r.error) setState(r.error);
    else {
      setState("Done");
      window.location.reload();
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {fields.map((f) => (
        <input
          key={f.name}
          type={f.type ?? "text"}
          className={`${INPUT} ${f.width ?? "w-40"}`}
          placeholder={f.placeholder}
          value={vals[f.name]}
          onChange={(e) => {
            setArmed(false);
            setVals({ ...vals, [f.name]: e.target.value });
          }}
        />
      ))}
      <button onClick={go} className={`${BTN} ${armed ? TONES.warn : TONES[tone]}`}>
        {armed ? `Confirm: ${label}` : label}
      </button>
      {state && <span className="text-xs text-acuity-text-ter">{state}</span>}
    </span>
  );
}

interface PreviewLine {
  creatorId: string;
  name: string;
  amount: number;
  entryCount: number;
  rail: string;
  payoutId?: string;
  status?: string;
  blocked: string[];
}
interface RunPreview {
  runKey: string;
  cutoff: string;
  lines: PreviewLine[];
}

/** Preview → select → approve → execute for one run. */
export function PayoutRunPanel({
  creators,
  stripePayoutsOn,
}: {
  creators: Array<{ id: string; name: string }>;
  stripePayoutsOn: boolean;
}) {
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<"approve" | "execute" | null>(null);
  const [offCycle, setOffCycle] = useState("");

  async function runPreview(offCycleCreatorId?: string) {
    setMsg("Building preview…");
    setArmed(null);
    const r = await post({ action: "payout-preview", ...(offCycleCreatorId ? { offCycleCreatorId } : {}) });
    if (r.error) return setMsg(r.error);
    const p = r.result as RunPreview;
    setPreview(p);
    setSelected(new Set(p.lines.filter((l) => l.payoutId && l.status === "previewed").map((l) => l.payoutId!)));
    setMsg(null);
  }

  async function approve() {
    if (!preview) return;
    if (armed !== "approve") return setArmed("approve");
    setArmed(null);
    const r = await post({ action: "payout-approve", runKey: preview.runKey, payoutIds: Array.from(selected) });
    if (r.error) return setMsg(r.error);
    setMsg(`Approved ${String(r.result)} payout(s). Execute when ready.`);
    // Update in place: an off-cycle re-preview would mint a new run key.
    setPreview({
      ...preview,
      lines: preview.lines.map((l) =>
        l.payoutId && selected.has(l.payoutId) && l.status === "previewed" ? { ...l, status: "approved" } : l
      ),
    });
    setSelected(new Set());
  }

  async function execute() {
    if (!preview) return;
    if (armed !== "execute") return setArmed("execute");
    setArmed(null);
    setMsg("Executing…");
    const r = await post({ action: "payout-execute", runKey: preview.runKey });
    if (r.error) return setMsg(r.error);
    const res = r.result as { sent: string[]; manual: string[]; failed: Array<{ payoutId: string; error: string }> };
    setMsg(
      `Sent ${res.sent.length} via Stripe. ${res.manual.length} to send by hand (PayPal/manual, then "Mark sent" below). ${
        res.failed.length ? `Failed: ${res.failed.map((f) => f.error).join("; ")}` : ""
      }`
    );
  }

  const eligible = preview?.lines.filter((l) => l.blocked.length === 0) ?? [];
  const held = preview?.lines.filter((l) => l.blocked.length > 0) ?? [];
  const approvedCount = eligible.filter((l) => l.status === "approved").length;
  const selectedTotal = eligible.filter((l) => l.payoutId && selected.has(l.payoutId)).reduce((s, l) => s + l.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={`${BTN} ${TONES.go}`} onClick={() => runPreview()}>
          Preview next run
        </button>
        <span className="text-acuity-text-ter text-sm">or off-cycle for one creator:</span>
        <select className={INPUT} value={offCycle} onChange={(e) => setOffCycle(e.target.value)}>
          <option value="">Pick a creator…</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className={`${BTN} ${TONES.plain}`} disabled={!offCycle} onClick={() => runPreview(offCycle)}>
          Preview off-cycle
        </button>
        {!stripePayoutsOn && (
          <span className="text-xs text-amber-400">Stripe transfers are OFF (CREATOR_STRIPE_PAYOUTS). Execute only records PayPal/manual.</span>
        )}
      </div>
      {msg && <p className="text-sm text-acuity-text-sec">{msg}</p>}
      {preview && (
        <div className="space-y-4">
          <p className="text-sm text-acuity-text-ter">
            Run <b className="text-acuity-text">{preview.runKey}</b> · covers rows payable before {preview.cutoff.slice(0, 16).replace("T", " ")} UTC
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-acuity-text-ter">
              <tr>
                <th className="py-1 w-8"></th>
                <th>Creator</th>
                <th>Amount</th>
                <th>Rows</th>
                <th>Rail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eligible.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-acuity-text-ter">Nobody is payable in this run.</td>
                </tr>
              )}
              {eligible.map((l) => (
                <tr key={l.creatorId} className="border-t border-acuity-line">
                  <td className="py-1.5">
                    {l.status === "previewed" && l.payoutId && (
                      <input
                        type="checkbox"
                        checked={selected.has(l.payoutId)}
                        onChange={(e) => {
                          const s = new Set(selected);
                          if (e.target.checked) s.add(l.payoutId!);
                          else s.delete(l.payoutId!);
                          setSelected(s);
                          setArmed(null);
                        }}
                      />
                    )}
                  </td>
                  <td>{l.name}</td>
                  <td className="tabular-nums">{usd(l.amount)}</td>
                  <td>{l.entryCount}</td>
                  <td>{l.rail}</td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <button className={`${BTN} ${armed === "approve" ? TONES.warn : TONES.go}`} disabled={selected.size === 0} onClick={approve}>
              {armed === "approve" ? `Confirm: approve ${selected.size} (${usd(selectedTotal)})` : `Approve selected (${selected.size})`}
            </button>
            <button className={`${BTN} ${armed === "execute" ? TONES.warn : TONES.stop}`} disabled={approvedCount === 0} onClick={execute}>
              {armed === "execute" ? `Confirm: execute ${approvedCount} approved` : `Execute approved (${approvedCount})`}
            </button>
            {armed && (
              <button className="text-xs underline text-acuity-text-ter" onClick={() => setArmed(null)}>
                cancel
              </button>
            )}
          </div>
          {held.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Held out</h3>
              <table className="w-full text-sm">
                <tbody>
                  {held.map((l) => (
                    <tr key={l.creatorId} className="border-t border-acuity-line">
                      <td className="py-1.5">{l.name}</td>
                      <td className="tabular-nums">{usd(l.amount)}</td>
                      <td className="text-amber-400">{l.blocked.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Editable boost figures for one post. */
export function PostFigures({
  postId,
  adSpend,
  trials,
  paidConversions,
}: {
  postId: string;
  adSpend: number | null;
  trials: number | null;
  paidConversions: number | null;
}) {
  return (
    <FormAction
      body={{ action: "post-update", postId }}
      label="Save"
      fields={[
        { name: "adSpendDollars", placeholder: "Ad spend $", width: "w-24", initial: adSpend == null ? "" : (adSpend / 100).toFixed(2) },
        { name: "trials", placeholder: "Trials", width: "w-16", initial: trials == null ? "" : String(trials) },
        { name: "paidConversions", placeholder: "Paid", width: "w-16", initial: paidConversions == null ? "" : String(paidConversions) },
      ]}
    />
  );
}

/** Creators-tab filters: three selects that update the URL on change. */
export function FilterBar({
  current,
  options,
}: {
  current: { status: string; persona: string; type: string };
  options: { status: string[]; persona: string[]; type: string[] };
}) {
  const labels = { status: "Any status", persona: "Any persona", type: "Any type" } as const;
  function go(key: keyof typeof labels, value: string) {
    const p = new URLSearchParams({ tab: "creators" });
    const next = { ...current, [key]: value };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    window.location.href = `/admin/creators?${p}`;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(labels) as Array<keyof typeof labels>).map((k) => (
        <select
          key={k}
          value={current[k]}
          onChange={(e) => go(k, e.target.value)}
          className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs"
        >
          <option value="">{labels[k]}</option>
          {options[k].map((v) => (
            <option key={v} value={v}>
              {v.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
