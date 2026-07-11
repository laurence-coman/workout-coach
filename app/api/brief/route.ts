import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Pulls today's Oura readiness + sleep if OURA_TOKEN is set.
// Get a token at cloud.ouraring.com/personal-access-tokens and add it
// as an env var in Vercel - the brief works without it, just blinder.
async function ouraSummary(): Promise<string | null> {
  const token = process.env.OURA_TOKEN;
  if (!token) return null;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const [r, s] = await Promise.all([
      fetch(
        `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`,
        { headers, cache: "no-store" }
      ).then((x) => (x.ok ? x.json() : null)),
      fetch(
        `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${today}&end_date=${today}`,
        { headers, cache: "no-store" }
      ).then((x) => (x.ok ? x.json() : null)),
    ]);
    const rd = r?.data?.[0];
    const sl = s?.data?.[0];
    if (!rd && !sl) return null;
    const parts: string[] = [];
    if (rd?.score) parts.push(`readiness score ${rd.score}`);
    if (rd?.contributors?.hrv_balance)
      parts.push(`HRV balance ${rd.contributors.hrv_balance}`);
    if (rd?.contributors?.resting_heart_rate)
      parts.push(`RHR contributor ${rd.contributors.resting_heart_rate}`);
    if (sl?.score) parts.push(`sleep score ${sl.score}`);
    return `Oura data this morning: ${parts.join(", ")}.`;
  } catch {
    return null;
  }
}

// Daily morning brief, triggered by Vercel cron. Creates a new conversation
// containing today's readiness + recommended session, so it's the first
// thing waiting in the app each morning.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();

  // Pull fresh Strava/Garmin activities before reasoning, so the brief
  // sees yesterday's completed workouts even if Sync was never clicked.
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "workout-coach-lac.vercel.app";
  await fetch(`https://${host}/api/strava/sync`, {
    method: "POST",
    cache: "no-store",
  }).catch(() => null);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
  const title = `Morning brief · ${today}`;

  // Idempotent: don't create twice in one day
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("title", title)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ created: false, reason: "already exists" });
  }

  const [system, oura] = await Promise.all([buildSystemPrompt(), ouraSummary()]);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 6000,
    system,
    messages: [
      {
        role: "user",
        content: `Write my morning brief. ${oura ?? "(No Oura data available today.)"}

Include, with your usual formatting rules:
1. One-line read on recovery/readiness (use the Oura data if present, otherwise recent training load).
2. Which rotation session is up today. Base this only on what the log confirms - state plainly which recent sessions are verified in the log, and if yesterday's planned session has no log entry, say so and ask rather than assuming it happened.
3. The full session prescription with targets anchored to my logged numbers.
4. A contingency option.
Keep it tight - this is a brief, not an essay.`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    return NextResponse.json({ created: false, reason: "empty response" });
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ title })
    .select()
    .single();
  if (error || !session) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  await supabase
    .from("messages")
    .insert({ role: "assistant", content: text, session_id: session.id });

  return NextResponse.json({ created: true, session: session.id, oura: !!oura });
}
