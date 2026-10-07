"use client";

/**
 * Client controls for the UGC outreach admin pages. Every button posts to
 * /api/admin/ugc/action and reloads the page on success.
 */
import { useState } from "react";

const BTN = "px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50";
const TONES: Record<string, string> = {
  go: "bg-emerald-600 hover:bg-emerald-500 text-white",
  plain: "bg-acuity-bg-inset hover:bg-acuity-card-bg",
  stop: "bg-zinc-600 hover:bg-zinc-500 text-white",
  warn: "bg-amber-600 hover:bg-amber-500 text-white",
};
const INPUT = "rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1 text-sm";

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; result?: unknown }> {
  const res = await fetch("/api/admin/ugc/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

export function ActionButton({
  body,
  label,
  tone = "plain",
  confirm: confirmText,
  doneText,
}: {
  body: Record<string, unknown>;
  label: string;
  tone?: keyof typeof TONES;
  confirm?: string;
  doneText?: string;
}) {
  const [state, setState] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  async function go() {
    if (confirmText && !armed) {
      setArmed(true);
      return;
    }
    setState("…");
    const r = await post(body);
    if (r.error) setState(r.error);
    else {
      setState(doneText ?? "Done");
      if (!doneText) window.location.reload();
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={go} className={`${BTN} ${TONES[tone]}`}>
        {armed ? confirmText : label}
      </button>
      {state && <span className="text-xs text-acuity-text-ter">{state}</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`${BTN} ${TONES.plain}`}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function DraftEditor({
  creatorId,
  subject,
  email,
  dm,
  startOpen,
}: {
  creatorId: string;
  subject: string;
  email: string;
  dm: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [s, setS] = useState(subject);
  const [e, setE] = useState(email);
  const [d, setD] = useState(dm);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) {
    return (
      <button className={`${BTN} ${TONES.plain}`} onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <div className="space-y-2 w-full">
      <input className={`${INPUT} w-full`} value={s} onChange={(x) => setS(x.target.value)} />
      <textarea className={`${INPUT} w-full h-56 font-mono`} value={e} onChange={(x) => setE(x.target.value)} />
      <textarea className={`${INPUT} w-full h-24 font-mono`} value={d} onChange={(x) => setD(x.target.value)} />
      <div className="flex items-center gap-2">
        <button
          className={`${BTN} ${TONES.go}`}
          onClick={async () => {
            setMsg("Checking claims…");
            const r = await post({ action: "edit", creatorId, subject: s, email: e, dm: d });
            if (r.error) return setMsg(r.error);
            const res = r.result as { status: string; notes: string | null };
            setMsg(`Saved. Claims check: ${res.status}${res.notes ? ` — ${res.notes}` : ""}`);
            if (res.status === "passed") setTimeout(() => window.location.reload(), 900);
          }}
        >
          Save + re-check
        </button>
        <button className={`${BTN} ${TONES.plain}`} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
      </div>
    </div>
  );
}

export function BriefEditor({ briefId, body }: { briefId: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [b, setB] = useState(body);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open)
    return (
      <button className={`${BTN} ${TONES.plain}`} onClick={() => setOpen(true)}>
        Edit brief
      </button>
    );
  return (
    <div className="space-y-2 w-full">
      <textarea className={`${INPUT} w-full h-96 font-mono`} value={b} onChange={(x) => setB(x.target.value)} />
      <button
        className={`${BTN} ${TONES.go}`}
        onClick={async () => {
          setMsg("Checking…");
          const r = await post({ action: "brief-edit", briefId, body: b });
          if (r.error) return setMsg(r.error);
          const res = r.result as { status: string; issues: string[] };
          setMsg(`Saved. Claims check: ${res.status}${res.issues.length ? ` — ${res.issues.join("; ")}` : ""}`);
          if (res.status === "passed") setTimeout(() => window.location.reload(), 900);
        }}
      >
        Save + re-check
      </button>
      {msg && <span className="text-xs text-acuity-text-ter ml-2">{msg}</span>}
    </div>
  );
}

export function ManualAddForm() {
  const [f, setF] = useState({ handle: "", platform: "", notes: "", quotedRate: "", quotedVideos: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <input className={INPUT} placeholder="@handle or profile URL" value={f.handle} onChange={set("handle")} />
      <select className={INPUT} value={f.platform} onChange={set("platform")}>
        <option value="">auto</option>
        <option value="instagram">Instagram</option>
        <option value="tiktok">TikTok</option>
      </select>
      <input className={`${INPUT} w-64`} placeholder="notes (e.g. seen in a competitor ad)" value={f.notes} onChange={set("notes")} />
      <input className={`${INPUT} w-28`} placeholder="quoted $" value={f.quotedRate} onChange={set("quotedRate")} />
      <input className={`${INPUT} w-24`} placeholder="for # videos" value={f.quotedVideos} onChange={set("quotedVideos")} />
      <button
        className={`${BTN} ${TONES.go}`}
        onClick={async () => {
          setMsg("Adding…");
          const r = await post({ action: "manual-add", ...f });
          setMsg(r.error ?? "Added — scoring and drafting now (a few minutes)");
          if (!r.error) setF({ handle: "", platform: "", notes: "", quotedRate: "", quotedVideos: "" });
        }}
      >
        Add creator
      </button>
      {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
    </div>
  );
}

export function DealForm({ creatorId }: { creatorId: string }) {
  const [fee, setFee] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <input className={`${INPUT} w-24`} placeholder="$ / video" value={fee} onChange={(e) => setFee(e.target.value)} />
      <button
        className={`${BTN} ${TONES.go}`}
        onClick={async () => {
          const r = await post({ action: "deal", creatorId, feePerVideo: fee });
          setMsg(r.error ?? "Deal marked — brief is being written");
          if (!r.error) setTimeout(() => window.location.reload(), 1200);
        }}
      >
        Mark deal
      </button>
      {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
    </span>
  );
}

export function PaidForm({ creatorId }: { creatorId: string }) {
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <input className={`${INPUT} w-24`} placeholder="$ paid" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <button
        className={`${BTN} ${TONES.plain}`}
        onClick={async () => {
          const r = await post({ action: "paid", creatorId, amount: amt });
          setMsg(r.error ?? "Recorded");
          if (!r.error) window.location.reload();
        }}
      >
        Record fee paid
      </button>
      {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
    </span>
  );
}

export function StatusSelect({ creatorId, current, statuses }: { creatorId: string; current: string; statuses: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        className={INPUT}
        defaultValue={current}
        onChange={async (e) => {
          const r = await post({ action: "status", creatorId, to: e.target.value });
          setMsg(r.error ?? "Saved");
          if (!r.error) window.location.reload();
        }}
      >
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
    </span>
  );
}

export function VideoNumbers({
  videoId,
  adSpend,
  trials,
  paidConversions,
  bonusPaid,
  extensionPaid,
}: {
  videoId: string;
  adSpend: number | null;
  trials: number | null;
  paidConversions: number | null;
  bonusPaid: number;
  extensionPaid: number;
}) {
  const [f, setF] = useState({
    adSpend: adSpend?.toString() ?? "",
    trials: trials?.toString() ?? "",
    paidConversions: paidConversions?.toString() ?? "",
    bonusPaid: bonusPaid ? bonusPaid.toString() : "",
    extensionPaid: extensionPaid ? extensionPaid.toString() : "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input className={`${INPUT} w-20`} placeholder="spend $" value={f.adSpend} onChange={set("adSpend")} />
      <input className={`${INPUT} w-16`} placeholder="trials" value={f.trials} onChange={set("trials")} />
      <input className={`${INPUT} w-16`} placeholder="paid" value={f.paidConversions} onChange={set("paidConversions")} />
      <input className={`${INPUT} w-20`} placeholder="bonus paid $" value={f.bonusPaid} onChange={set("bonusPaid")} />
      <input className={`${INPUT} w-20`} placeholder="ext. paid $" value={f.extensionPaid} onChange={set("extensionPaid")} />
      <button
        className={`${BTN} ${TONES.plain}`}
        onClick={async () => {
          const r = await post({ action: "video-numbers", videoId, ...f });
          setMsg(r.error ?? "Saved");
          if (!r.error) window.location.reload();
        }}
      >
        Save
      </button>
      {msg && <span className="text-xs text-acuity-text-ter">{msg}</span>}
    </span>
  );
}
