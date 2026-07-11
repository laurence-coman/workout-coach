import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Redirects the user to Strava's OAuth consent screen.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri: `${origin}/api/strava/callback`,
    response_type: "code",
    scope: "activity:read_all",
    approval_prompt: "auto",
  });
  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params}`
  );
}
