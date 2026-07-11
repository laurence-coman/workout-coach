"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Workout = {
  id: string;
  date: string;
  type: string;
  name: string | null;
  duration_min: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  effort: number | null;
  notes: string | null;
  source: string;
};

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  run: { bg: "#e7efff", fg: "#1d4fd8" },
  swim: { bg: "#e0f4f7", fg: "#0e7490" },
  lift: { bg: "#e8f5ec", fg: "#15803d" },
  ride: { bg: "#fdeede", fg: "#c2570b" },
  hike: { bg: "#f0ebe1", fg: "#7c5e2a" },
  other: { bg: "#ededf0", fg: "#565b66" },
};

function weekKey(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10); // full ISO date so weeks sort correctly
}

export default function Dashboard() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    const res = await fetch("/api/workouts");
    const data = await res.json();
    if (Array.isArray(data)) setWorkouts(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function syncStrava() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsAuth) {
          window.location.href = "/api/strava/connect";
          return;
        }
        throw new Error(data.error || "Sync failed");
      }
      setSyncMsg(`Imported ${data.imported} new activities`);
      await load();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const weekly = useMemo(() => {
    const map = new Map<string, { week: string; minutes: number; km: number }>();
    for (const w of workouts) {
      const key = weekKey(w.date);
      const entry = map.get(key) ?? { week: key, minutes: 0, km: 0 };
      entry.minutes += w.duration_min ?? 0;
      entry.km += w.distance_km ?? 0;
      map.set(key, entry);
    }
    return [...map.values()]
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-12)
      .map((w) => ({ ...w, label: w.week.slice(5) }));
  }, [workouts]);

  const stats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const thisWeek = workouts.filter((w) => w.date >= sevenDaysAgo);
    return {
      total: workouts.length,
      weekCount: thisWeek.length,
      weekMinutes: Math.round(
        thisWeek.reduce((s, w) => s + (w.duration_min ?? 0), 0)
      ),
      weekKm:
        Math.round(thisWeek.reduce((s, w) => s + (w.distance_km ?? 0), 0) * 10) /
        10,
    };
  }, [workouts]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1>Dashboard</h1>
        <div>
          <button className="btn btn-secondary" onClick={syncStrava} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Strava"}
          </button>
          {syncMsg && <span className="save-note">{syncMsg}</span>}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Workouts (7 days)</h3>
          <div className="big">{stats.weekCount}</div>
        </div>
        <div className="card">
          <h3>Minutes (7 days)</h3>
          <div className="big">{stats.weekMinutes}</div>
        </div>
        <div className="card">
          <h3>Distance (7 days)</h3>
          <div className="big">{stats.weekKm} km</div>
        </div>
        <div className="card">
          <h3>All-time workouts</h3>
          <div className="big">{stats.total}</div>
        </div>
      </div>

      <div className="chart-card">
        <h2>Weekly training minutes (last 12 weeks)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weekly}>
            <defs>
              <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e3e5e0" vertical={false} />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#ffffff", border: "1px solid #e3e5e0", borderRadius: 8 }}
            />
            <Bar dataKey="minutes" fill="url(#barFill)" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h2>Workout log</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Name</th>
              <th>Duration</th>
              <th>Distance</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {workouts.slice(0, 50).map((w) => (
              <tr key={w.id}>
                <td>{w.date}</td>
                <td>
                  <span
                    className="tag"
                    style={{
                      background: (TYPE_COLORS[w.type] ?? TYPE_COLORS.other).bg,
                      color: (TYPE_COLORS[w.type] ?? TYPE_COLORS.other).fg,
                    }}
                  >
                    {w.type}
                  </span>
                </td>
                <td>{w.name ?? "—"}</td>
                <td>{w.duration_min ? `${Math.round(w.duration_min)} min` : "—"}</td>
                <td>{w.distance_km ? `${w.distance_km} km` : "—"}</td>
                <td>{w.source}</td>
              </tr>
            ))}
            {workouts.length === 0 && (
              <tr>
                <td colSpan={6}>
                  No workouts yet. Log one in Chat or hit Sync Strava.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
