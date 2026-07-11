"use client";

import { useEffect, useState } from "react";

type Goal = {
  id: string;
  title: string;
  target: string | null;
  deadline: string | null;
  status: string;
};

type Guardrail = {
  id: string;
  rule: string;
  category: string;
  active: boolean;
};

const CATEGORIES = ["injury", "programming", "logging", "nutrition", "general"];

export default function SettingsForm() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [coachNotes, setCoachNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [notesSaved, setNotesSaved] = useState(false);

  // New-item drafts
  const [newGoal, setNewGoal] = useState({ title: "", target: "", deadline: "" });
  const [newRule, setNewRule] = useState({ rule: "", category: "general" });

  async function loadAll() {
    const [g, r, p] = await Promise.all([
      fetch("/api/goals").then((x) => x.json()),
      fetch("/api/guardrails").then((x) => x.json()),
      fetch("/api/profile").then((x) => x.json()),
    ]);
    if (Array.isArray(g)) setGoals(g);
    if (Array.isArray(r)) setGuardrails(r);
    setCoachNotes(p.coach_notes ?? "");
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ----- Goals -----
  async function addGoal() {
    if (!newGoal.title.trim()) return;
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newGoal),
    });
    setNewGoal({ title: "", target: "", deadline: "" });
    loadAll();
  }

  async function updateGoal(id: string, updates: Partial<Goal>) {
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...updates } : g)));
    await fetch("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  }

  async function deleteGoal(id: string) {
    setGoals((gs) => gs.filter((g) => g.id !== id));
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // ----- Guardrails -----
  async function addRule() {
    if (!newRule.rule.trim()) return;
    await fetch("/api/guardrails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRule),
    });
    setNewRule({ rule: "", category: "general" });
    loadAll();
  }

  async function updateRule(id: string, updates: Partial<Guardrail>) {
    setGuardrails((rs) => rs.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    await fetch("/api/guardrails", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  }

  async function deleteRule(id: string) {
    setGuardrails((rs) => rs.filter((r) => r.id !== id));
    await fetch("/api/guardrails", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // ----- Coach notes -----
  async function saveNotes() {
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_notes: coachNotes }),
    });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="settings-form">
      <h1>Settings</h1>

      {/* GOALS */}
      <section className="settings-section">
        <h2>Performance goals</h2>
        <p className="hint">
          The coach reads these on every message. Click any field to edit.
          Changes save automatically.
        </p>
        {goals.map((g) => (
          <div key={g.id} className={`item-row ${g.status !== "active" ? "item-dim" : ""}`}>
            <input
              className="item-input item-grow"
              value={g.title}
              onChange={(e) => updateGoal(g.id, { title: e.target.value })}
            />
            <input
              className="item-input item-grow"
              placeholder="measurable target"
              value={g.target ?? ""}
              onChange={(e) => updateGoal(g.id, { target: e.target.value })}
            />
            <input
              className="item-input"
              type="date"
              value={g.deadline ?? ""}
              onChange={(e) => updateGoal(g.id, { deadline: e.target.value })}
            />
            <select
              className="item-input"
              value={g.status}
              onChange={(e) => updateGoal(g.id, { status: e.target.value })}
            >
              <option value="active">active</option>
              <option value="achieved">achieved</option>
              <option value="dropped">dropped</option>
            </select>
            <button className="icon-btn" title="Delete" onClick={() => deleteGoal(g.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="item-row item-new">
          <input
            className="item-input item-grow"
            placeholder="New goal, e.g. Bench 205 lb x1"
            value={newGoal.title}
            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
          />
          <input
            className="item-input item-grow"
            placeholder="target (optional)"
            value={newGoal.target}
            onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })}
          />
          <input
            className="item-input"
            type="date"
            value={newGoal.deadline}
            onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
          />
          <button className="btn" onClick={addGoal}>
            Add
          </button>
        </div>
      </section>

      {/* GUARDRAILS */}
      <section className="settings-section">
        <h2>Guardrails</h2>
        <p className="hint">
          Hard rules the coach must respect. Toggle off to pause a rule without
          deleting it.
        </p>
        {guardrails.map((r) => (
          <div key={r.id} className={`item-row ${!r.active ? "item-dim" : ""}`}>
            <input
              type="checkbox"
              checked={r.active}
              title={r.active ? "Active" : "Paused"}
              onChange={(e) => updateRule(r.id, { active: e.target.checked })}
            />
            <select
              className="item-input"
              value={r.category}
              onChange={(e) => updateRule(r.id, { category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="item-input item-grow"
              value={r.rule}
              onChange={(e) => updateRule(r.id, { rule: e.target.value })}
            />
            <button className="icon-btn" title="Delete" onClick={() => deleteRule(r.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="item-row item-new">
          <select
            className="item-input"
            value={newRule.category}
            onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="item-input item-grow"
            placeholder="New rule, e.g. No running until foot is cleared"
            value={newRule.rule}
            onChange={(e) => setNewRule({ ...newRule, rule: e.target.value })}
          />
          <button className="btn" onClick={addRule}>
            Add
          </button>
        </div>
      </section>

      {/* COACH NOTES */}
      <section className="settings-section">
        <h2>Coach notes</h2>
        <p className="hint">
          The AI saves durable facts here as you chat (benchmarks, injury
          status, preferences). Edit or prune anytime.
        </p>
        <textarea
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={saveNotes}>
            Save notes
          </button>
          {notesSaved && <span className="save-note">Saved ✓</span>}
        </div>
      </section>
    </div>
  );
}
