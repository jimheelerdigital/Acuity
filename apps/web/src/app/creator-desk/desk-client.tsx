"use client";

import { useState } from "react";

const INPUT =
  "w-full rounded-[14px] border border-acuity-line bg-acuity-bg-inset px-4 py-3 text-[15px] text-acuity-text placeholder:text-acuity-text-quiet focus:border-acuity-line-strong focus:outline-none";
const BTN = "rounded-full px-5 py-3 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50";

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const res = await fetch("/api/creator-desk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

export function AddCreatorForm() {
  const [f, setF] = useState({ handle: "", firstName: "", email: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      id="add-creator-form"
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await post({ action: "add", ...f });
        setBusy(false);
        if (r.error) setMsg({ ok: false, text: r.error });
        else {
          setMsg({ ok: true, text: r.message ?? "Added." });
          setF({ handle: "", firstName: "", email: "", code: "" });
          setTimeout(() => window.location.reload(), 6000);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px] text-acuity-text-sec">
        Instagram handle
        <input name="handle" className={INPUT} placeholder="@handle" value={f.handle} onChange={set("handle")} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-acuity-text-sec">
        First name
        <input name="firstName" className={INPUT} placeholder="Grace" value={f.firstName} onChange={set("firstName")} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-acuity-text-sec">
        Email
        <input name="email" type="email" className={INPUT} placeholder="grace@email.com" value={f.email} onChange={set("email")} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-acuity-text-sec">
        Code they want (optional)
        <input name="code" className={INPUT} placeholder="GRACE" value={f.code} onChange={set("code")} />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button id="add-creator-submit" type="submit" disabled={busy} className={`${BTN} bg-acuity-grad-primary text-white`}>
          {busy ? "Adding…" : "Add creator & send invite"}
        </button>
        {msg && (
          <p id="add-creator-result" className={`text-[14px] ${msg.ok ? "text-acuity-good" : "text-acuity-bad"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

export function ResendInvite({ creatorId }: { creatorId: string }) {
  const [state, setState] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="text-[13px] font-semibold text-acuity-text-sec underline"
        onClick={async () => {
          setState("Sending…");
          const r = await post({ action: "resend", creatorId });
          setState(r.error ?? r.message ?? "Sent");
        }}
      >
        Resend invite
      </button>
      {state && <span className="text-[12px] text-acuity-text-ter">{state}</span>}
    </span>
  );
}
