import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 120;
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

function etDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function etWeekday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/New_York",
  }).format(new Date());
}

type WRow = {
  date: string;
  type: string;
  duration_min: number | null;
  distance_km: number | null;
};

function bucketSummary(rows: WRow[]): string {
  if (rows.length === 0) return "no logged sessions";
  const byType = new Map<string, { n: number; min: number; km: number }>();
  let totalMin = 0;
  for (const r of rows) {
    const b = byType.get(r.type) ?? { n: 0, min: 0, km: 0 };
    b.n += 1;
    b.min += r.duration_min ?? 0;
    b.km += r.distance_km ?? 0;
    totalMin += r.duration_min ?? 0;
    byType.set(r.type, b);
  }
  const parts = [...byType.entries()].map(
    ([t, b]) =>
      `${t} x${b.n} (${Math.round(b.min)}min${b.km ? `, ${b.km.toFixed(1)}km` : ""})`
  );
  return `${rows.length} sessions, ${Math.round(totalMin)} total min: ${parts.join("; ")}`;
}

// Last 7 days vs the 7 before - hard numbers the review must reckon with.
async function weeklyAggregates(
  supabase: ReturnType<typeof getSupabase>
): Promise<string> {
  const d7 = etDate(-7);
  const d14 = etDate(-14);
  const { data } = await supabase
    .from("workouts")
    .select("date,type,duration_min,distance_km")
    .gte("date", d14)
    .order("date");
  const rows: WRow[] = data ?? [];
  const thisWeek = rows.filter((r) => r.date >= d7);
  const priorWeek = rows.filter((r) => r.date < d7);
  return `LAST 7 DAYS (${d7} to ${etDate()}): ${bucketSummary(thisWeek)}
PRIOR 7 DAYS (${d14} to ${d7}): ${bucketSummary(priorWeek)}`;
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

  const isMonday = etWeekday() === "Mon" || new URL(req.url).searchParams.get("review") === "1";
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
  const title = isMonday ? `Weekly review · ${today}` : `Morning brief · ${today}`;

  // Idempotent: don't create twice in one day
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("title", title)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ created: false, reason: "already exists" });
  }

  const [system, oura, aggregates] = await Promise.all([
    buildSystemPrompt(),
    ouraSummary(),
    isMonday ? weeklyAggregates(supabase) : Promise.resolve(""),
  ]);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 6000,
    system,
    messages: [
      {
        role: "user",
        content: isMonday
          ? `Write my weekly review and recalibration. ${oura ?? "(No Oura data available today.)"}

Hard numbers for the week (computed from the log - reckon with these, do not re-derive):
${aggregates}

Structure:
1. Last week by the numbers - interpret the aggregates above vs the rotation's intent (3 lifts, 2 swims, 1 bike per cycle). Flag any load spike over ~25% week-over-week.
2. What went well - tie to specific logged numbers and benchmarks. Call out PRs or firsts.
3. What needs work - max 3 items, each specific and fixable this week. Audit zone discipline: were easy days actually easy per the HR data?
4. Week ahead - commitments, not vibes: what progresses (exact new loads/targets), what holds, whether a deload is due, and any gate approaching (e.g. the foot test run window and December ultra timeline).
5. Any decision I need to make this week - or say there is none.
6. Today's session in full (completeness rules apply).`
          : `Write my morning brief. ${oura ?? "(No Oura data available today.)"}

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
