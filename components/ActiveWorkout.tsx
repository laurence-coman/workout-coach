"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SOURCES } from "@/components/sources";

type PlanItem = { name: string; prescription: string; cues?: string; tag?: string };
type Plan = {
  id: string;
  title: string;
  date: string;
  type: string;
  purpose: string | null;
  est_minutes: number | null;
  items: PlanItem[];
  status: string;
};

export default function ActiveWorkout() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((d) => setPlan(d.active))
      .finally(() => setLoading(false));
  }, []);

  const doneCount = plan ? plan.items.filter((it) => done[it.name]).length : 0;

  async function complete() {
    if (!plan || saving) return;
    setSaving(true);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: plan.id, entries, rpe, pain }),
    }).then((r) => r.json());
    setSaving(false);
    if (res.ok) setCompleted(true);
  }

  if (loading) return <p>Loading…</p>;

  if (completed) {
    return (
      <div className="wt-empty">
        <p className="empty-title">Logged ✓</p>
        <p className="empty-sub">
          Session saved to your history - the coach sees it immediately.
        </p>
        <div className="chips" style={{ marginTop: 18 }}>
          <Link className="chip" href="/dashboard">View on Dashboard</Link>
          <Link className="chip" href="/">Debrief with coach</Link>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="wt-empty">
        <p className="empty-title">No active workout</p>
        <p className="empty-sub">
          Build the session with your coach in Chat, then say &ldquo;lock it
          in&rdquo; - it lands here, ready for the gym floor.
        </p>
        <div className="chips" style={{ marginTop: 18 }}>
          <Link className="chip" href="/">Open Chat</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wt">
      <div className="wt-header">
        <div>
          <h1>{plan.title}</h1>
          <p className="wt-meta">
            {plan.date} · {plan.type}
            {plan.est_minutes ? ` · ~${plan.est_minutes} min` : ""}
          </p>
          {plan.purpose && <p className="wt-purpose">{plan.purpose}</p>}
        </div>
        <div className="wt-progress">
          {doneCount}/{plan.items.length}
        </div>
      </div>

      {plan.items.map((it, i) => (
        <div key={it.name} className={`wt-card ${done[it.name] ? "done" : ""}`}>
          <div className="wt-card-head">
            <span className="wt-num">{i + 1}</span>
            <div className="wt-card-title">
              <h2>{it.name}</h2>
              <p className="wt-rx">{it.prescription}</p>
              {it.cues && <p className="wt-cues">{it.cues}</p>}
            </div>
            {it.tag && SOURCES[it.tag] && (
              <span className="src-chip" title={SOURCES[it.tag].name}>
                {SOURCES[it.tag].label}
              </span>
            )}
          </div>
          <div className="wt-log-row">
            <input
              className="wt-input"
              placeholder="e.g. 8, 8, 7 @ 123 · felt strong"
              value={entries[it.name] ?? ""}
              onChange={(e) =>
                setEntries((prev) => ({ ...prev, [it.name]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  setDone((prev) => ({ ...prev, [it.name]: true }));
              }}
            />
            <button
              className={`wt-check ${done[it.name] ? "on" : ""}`}
              title={done[it.name] ? "Logged" : "Mark done"}
              onClick={() =>
                setDone((prev) => ({ ...prev, [it.name]: !prev[it.name] }))
              }
            >
              ✓
            </button>
          </div>
        </div>
      ))}

      <div className="wt-finish">
        <div className="wt-scale">
          <span className="wt-scale-label">Session RPE</span>
          <div className="wt-scale-chips">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                className={`wt-chip ${rpe === n ? "on" : ""}`}
                onClick={() => setRpe(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="wt-scale">
          <span className="wt-scale-label">Foot pain</span>
          <div className="wt-scale-chips">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                className={`wt-chip pain ${pain === n ? "on" : ""}`}
                onClick={() => setPain(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button className="btn send-btn wt-complete" onClick={complete} disabled={saving}>
          {saving ? "Logging…" : "Complete workout · auto-log"}
        </button>
      </div>
    </div>
  );
}
