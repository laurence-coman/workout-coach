import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Strava redirects here after the user approves access.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${url.origin}/dashboard?strava=denied`);
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(`${url.origin}/dashboard?strava=error`);
  }

  const data = await res.json();
  const supabase = getSupabase();
  await supabase.from("strava_tokens").upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id ?? null,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.redirect(`${url.origin}/dashboard?strava=connected`);
}
