"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  entries?: Draft | null;
};
type Draft = {
  entries?: Record<string, string>;
  done?: Record<string, boolean>;
  rpe?: number | null;
  pain?: number | null;
  t?: number;
};

const draftKey = (id: string) => `wt-draft-${id}`;

export default function ActiveWorkout() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const planIdRef = useRef<string | null>(null);
  const draftRef = useRef<Draft>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Hydrate: newest of server draft vs localStorage draft wins
  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((d) => {
        const p: Plan | null = d.active;
        setPlan(p);
        setLastResults(d.lastResults ?? {});
        if (!p) return;
        planIdRef.current = p.id;
        const server: Draft = p.entries ?? {};
        let local: Draft = {};
        try {
          local = JSON.parse(localStorage.getItem(draftKey(p.id)) ?? "{}");
        } catch {}
        const winner = (local.t ?? 0) > (server.t ?? 0) ? local : server;
        if (winner.entries) setEntries(winner.entries);
        if (winner.done) setDone(winner.done);
        if (winner.rpe != null) setRpe(winner.rpe);
        if (winner.pain != null) setPain(winner.pain);
        draftRef.current = winner;
      })
      .finally(() => setLoading(false));
  }, []);

  // Autosave: localStorage instantly, server on an 800ms debounce
  const scheduleSave = useCallback((next: Draft) => {
    const id = planIdRef.current;
    if (!id) return;
    next.t = Date.now();
    draftRef.current = next;
    dirtyRef.current = true;
    try {
      localStorage.setItem(draftKey(id), JSON.stringify(next));
    } catch {}
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: id, draft: draftRef.current }),
          keepalive: true,
        });
        dirtyRef.current = false;
        setSaveState("saved");
      } catch {
        setSaveState("idle"); // localStorage still has it
      }
    }, 800);
  }, []);

  // Flush pending save when leaving the page/tab
  useEffect(() => {
    const flush = () => {
      const id = planIdRef.current;
      if (!id || !dirtyRef.current) return;
      try {
        navigator.sendBeacon?.(
          "/api/plan/beacon",
          new Blob([JSON.stringify({ plan_id: id, draft: draftRef.current })], {
            type: "application/json",
          })
        );
      } catch {}
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      const next: Draft = {
        entries: patch.entries ?? draftRef.current.entries ?? {},
        done: patch.done ?? draftRef.current.done ?? {},
        rpe: patch.rpe !== undefined ? patch.rpe : draftRef.current.rpe ?? null,
        pain: patch.pain !== undefined ? patch.pain : draftRef.current.pain ?? null,
      };
      scheduleSave(next);
    },
    [scheduleSave]
  );

  const doneCount = plan ? plan.items.filter((it) => done[it.name]).length : 0;

  async function complete() {
    if (!plan || saving) return;
    setSaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: plan.id, entries, rpe, pain }),
    }).then((r) => r.json());
    setSaving(false);
    if (res.ok) {
      try {
        localStorage.removeItem(draftKey(plan.id));
      } catch {}
      setCompleted(true);
    }
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
            {saveState === "saved" && <span className="wt-saved"> · saved ✓</span>}
            {saveState === "saving" && <span className="wt-saved"> · saving…</span>}
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
              {lastResults[it.name] && (
                <p className="wt-last">Last: {lastResults[it.name]}</p>
              )}
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
              onChange={(e) => {
                const next = { ...entries, [it.name]: e.target.value };
                setEntries(next);
                update({ entries: next });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const next = { ...done, [it.name]: true };
                  setDone(next);
                  update({ done: next });
                }
              }}
            />
            <button
              className={`wt-check ${done[it.name] ? "on" : ""}`}
              title={done[it.name] ? "Logged" : "Mark done"}
              onClick={() => {
                const next = { ...done, [it.name]: !done[it.name] };
                setDone(next);
                update({ done: next });
              }}
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
                onClick={() => {
                  setRpe(n);
                  update({ rpe: n });
                }}
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
                onClick={() => {
                  setPain(n);
                  update({ pain: n });
                }}
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
