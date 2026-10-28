"use client";

import { useState } from "react";

export function WhyNote({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (state === "sent") return <p style={{ color: "#2F855A", fontWeight: 600, fontSize: 15 }}>Got it. Thank you.</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setState("sending");
        const r = await fetch("/api/why", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, text }) }).catch(() => null);
        setState(r?.ok ? "sent" : "error");
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={4}
        placeholder="What got in the way?"
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #eadfd8", borderRadius: 14, padding: 12, fontSize: 15, fontFamily: "inherit", resize: "vertical" }}
      />
      <button
        type="submit"
        disabled={state === "sending" || !text.trim()}
        style={{ marginTop: 12, width: "100%", border: 0, borderRadius: 999, padding: "13px 18px", background: "linear-gradient(90deg,#FF9A76,#E06B46)", color: "#fff", fontWeight: 700, fontSize: 15, opacity: !text.trim() ? 0.6 : 1 }}
      >
        {state === "sending" ? "Sending…" : "Send"}
      </button>
      {state === "error" && <p style={{ color: "#C53030", fontSize: 13 }}>That didn&rsquo;t send. You can reply to the email instead.</p>}
    </form>
  );
}
