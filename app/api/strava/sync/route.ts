import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAccessToken, mapType, type StravaActivity } from "@/lib/strava";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 25-yard pool = 22.86 m. Override with POOL_LENGTH_METERS if the pool changes.
const POOL_LENGTH_M = Number(process.env.POOL_LENGTH_METERS ?? 22.86);

// Laurence's HR zones (from Garmin, LTHR 166): Z1 93-111, Z2 112-129,
// Z3 130-148, Z4 149-166, Z5 >166. Update here if retested.
const ZONE_UPPER = [111, 129, 148, 166, Infinity];

// Only spend stream API calls (1 per activity, rate-limited) on this year.
const ENRICH_SINCE = "2026-01-01";

type StravaLap = {
  distance: number;
  moving_time: number;
  average_cadence?: number;
};

async function computeSwimMetrics(
  activityId: number,
  token: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/laps`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const laps: StravaLap[] = await res.json();

    let lengths = 0;
    let seconds = 0;
    let strokes = 0;
    for (const lap of laps) {
      if (!lap.distance || !lap.moving_time) continue;
      const n = Math.round(lap.distance / POOL_LENGTH_M);
      if (n < 1) continue;
      lengths += n;
      seconds += lap.moving_time;
      if (lap.average_cadence) {
        strokes += (lap.average_cadence * lap.moving_time) / 60;
      }
    }
    if (!lengths || !seconds) return null;

    const timePerLength = seconds / lengths;
    const strokesPerLength = strokes > 0 ? strokes / lengths : null;
    const swolf =
      strokesPerLength !== null
        ? Math.round(timePerLength + strokesPerLength)
        : null;

    const parts = [`${lengths} lengths`];
    if (strokesPerLength !== null)
      parts.push(`~${strokesPerLength.toFixed(1)} strokes/length`);
    if (swolf !== null) parts.push(`SWOLF ~${swolf}`);
    return `Computed from Strava laps: ${parts.join(", ")}.`;
  } catch {
    return null;
  }
}

async function computeHrZones(
  activityId: number,
  token: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const streams = await res.json();
    const hr: number[] | undefined = streams?.heartrate?.data;
    const t: number[] | undefined = streams?.time?.data;
    if (!hr || !t || hr.length < 10 || hr.length !== t.length) return null;

    const zoneSec = [0, 0, 0, 0, 0];
    let total = 0;
    let maxHr = 0;
    for (let i = 1; i < hr.length; i++) {
      const dt = t[i] - t[i - 1];
      if (dt <= 0 || dt > 60) continue;
      const z = ZONE_UPPER.findIndex((u) => hr[i] <= u);
      zoneSec[z] += dt;
      total += dt;
      if (hr[i] > maxHr) maxHr = hr[i];
    }
    if (total < 300) return null;

    const parts = zoneSec
      .map((sec, i) => ({ z: i + 1, pct: Math.round((sec / total) * 100) }))
      .filter((x) => x.pct >= 3)
      .map((x) => `Z${x.z} ${x.pct}%`);
    return `HR zones: ${parts.join(", ")} (max ${maxHr}).`;
  } catch {
    return null;
  }
}

function summaryToRow(a: StravaActivity, notes: string | null) {
  return {
    date: a.start_date_local.slice(0, 10),
    type: mapType(a.sport_type || a.type),
    name: a.name,
    duration_min: Math.round(a.moving_time / 60),
    distance_km: a.distance
      ? Math.round((a.distance / 1000) * 100) / 100
      : null,
    avg_hr: a.average_heartrate ?? null,
    notes,
    source: "strava",
    strava_id: a.id,
  };
}

// Modes:
//   POST /api/strava/sync                     - normal: latest 100, with metrics for new ones
//   POST /api/strava/sync?full=1&page=N       - history import: summaries only, 200/page
//   POST /api/strava/sync?backfill=1          - enrich imported rows since 2026-01-01 with
//                                               HR zones + swim metrics, 35 per call
export async function POST(req: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Strava not connected", needsAuth: true },
      { status: 401 }
    );
  }

  const supabase = getSupabase();
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const backfill = url.searchParams.get("backfill") === "1";

  if (backfill) {
    const { data: rows } = await supabase
      .from("workouts")
      .select("id,strava_id,type,notes,avg_hr")
      .not("strava_id", "is", null)
      .gte("date", ENRICH_SINCE)
      .order("date", { ascending: false })
      .limit(300);

    let updated = 0;
    let examined = 0;
    for (const r of rows ?? []) {
      if (updated >= 35) break;
      const notes = r.notes ?? "";
      const needZones = r.avg_hr !== null && !notes.includes("HR zones:");
      const needSwim =
        r.type === "swim" && !notes.includes("Computed from Strava laps");
      if (!needZones && !needSwim) continue;
      examined++;
      const parts: string[] = [];
      if (needSwim) {
        const m = await computeSwimMetrics(r.strava_id, token);
        if (m) parts.push(m);
      }
      if (needZones) {
        const z = await computeHrZones(r.strava_id, token);
        if (z) parts.push(z);
      }
      if (parts.length) {
        const merged = [notes, parts.join(" ")].filter(Boolean).join(" ").trim();
        await supabase.from("workouts").update({ notes: merged }).eq("id", r.id);
        updated++;
      }
    }
    return NextResponse.json({ backfilled: updated, examined });
  }

  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const perPage = full ? 200 : 100;
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${full ? page : 1}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Strava API error (${res.status})` },
      { status: 502 }
    );
  }

  const activities: StravaActivity[] = await res.json();

  const { data: existing } = await supabase
    .from("workouts")
    .select("strava_id")
    .not("strava_id", "is", null);
  const known = new Set((existing ?? []).map((r) => r.strava_id));
  const fresh = activities.filter((a) => !known.has(a.id));

  const rows = [];
  for (const a of fresh) {
    let notes: string | null = null;
    if (!full) {
      // Normal sync enriches inline; full import defers to backfill mode.
      const noteParts: string[] = [];
      const type = mapType(a.sport_type || a.type);
      if (type === "swim") {
        const swim = await computeSwimMetrics(a.id, token);
        if (swim) noteParts.push(swim);
      }
      if (a.average_heartrate) {
        const zones = await computeHrZones(a.id, token);
        if (zones) noteParts.push(zones);
      }
      notes = noteParts.length ? noteParts.join(" ") : null;
    }
    rows.push(summaryToRow(a, notes));
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("workouts").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    imported: rows.length,
    fetched: activities.length,
    page: full ? page : 1,
  });
}
