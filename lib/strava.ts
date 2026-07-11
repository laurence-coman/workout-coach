import { getSupabase } from "./supabase";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  moving_time: number; // seconds
  distance: number; // meters
  average_heartrate?: number;
};

// Map Strava sport types to our simple types
export function mapType(sportType: string): string {
  const t = sportType.toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("ride") || t.includes("bike") || t.includes("cycl")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("weight") || t.includes("workout") || t.includes("crossfit"))
    return "lift";
  if (t.includes("yoga")) return "yoga";
  if (t.includes("hike") || t.includes("walk")) return "hike";
  return "other";
}

// Returns a valid access token, refreshing if expired.
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  const { data: tokens } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("id", 1)
    .single();

  if (!tokens?.refresh_token) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.access_token && tokens.expires_at && tokens.expires_at > nowSec + 60) {
    return tokens.access_token;
  }

  // Refresh
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) return null;
  const fresh = await res.json();

  await supabase
    .from("strava_tokens")
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return fresh.access_token;
}
