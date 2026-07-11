import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAccessToken, mapType, type StravaActivity } from "@/lib/strava";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 25-yard pool = 22.86 m. Override with POOL_LENGTH_METERS if the pool changes.
const POOL_LENGTH_M = Number(process.env.POOL_LENGTH_METERS ?? 22.86);

type StravaLap = {
  distance: number; // meters
  moving_time: number; // seconds
  average_cadence?: number; // strokes per minute for swims
};

// Strava's API has no SWOLF field, but it's derivable from lap data:
// strokes/length = stroke rate x length time / 60; SWOLF = length seconds + strokes.
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

// Pulls recent Strava activities (which include Garmin workouts since the
// user's Garmin account is linked to Strava) and imports new ones.
// Swims get SWOLF + strokes/length computed from lap data.
export async function POST() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Strava not connected", needsAuth: true },
      { status: 401 }
    );
  }

  const res = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=100",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Strava API error (${res.status})` },
      { status: 502 }
    );
  }

  const activities: StravaActivity[] = await res.json();
  const supabase = getSupabase();

  // Skip activities we've already imported
  const { data: existing } = await supabase
    .from("workouts")
    .select("strava_id")
    .not("strava_id", "is", null);
  const known = new Set((existing ?? []).map((r) => r.strava_id));

  const fresh = activities.filter((a) => !known.has(a.id));
  const rows = [];
  for (const a of fresh) {
    const type = mapType(a.sport_type || a.type);
    let notes: string | null = null;
    if (type === "swim") {
      notes = await computeSwimMetrics(a.id, token);
    }
    rows.push({
      date: a.start_date_local.slice(0, 10),
      type,
      name: a.name,
      duration_min: Math.round(a.moving_time / 60),
      distance_km: a.distance
        ? Math.round((a.distance / 1000) * 100) / 100
        : null,
      avg_hr: a.average_heartrate ?? null,
      notes,
      source: "strava",
      strava_id: a.id,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("workouts").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ imported: rows.length });
}
