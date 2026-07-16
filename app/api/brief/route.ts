import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Two-phase briefing:
//   Evening (~8pm ET cron): consolidate memory, sync Strava, publish
//     TOMORROW's full session plan (Sunday evening = weekly review + Monday plan).
//   Morning (~6am ET cron): fresh Oura readiness check posted into the same
//     conversation - confirms the plan or adjusts it.
// Phase resolves from UTC hour if not passed explicitly (?phase=evening|morning).

function etDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function etWeekday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/New_York",
  }).format(d);
}

function fmtShort(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

async function ouraToday(): Promise<string | null> {
  const token = process.env.OURA_TOKEN;
  if (!token) return null;
  const today = etDate();
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
    if (rd?.score) parts.push(`readiness ${rd.score}`);
    if (rd?.contributors?.hrv_balance)
      parts.push(`HRV balance ${rd.contributors.hrv_balance}`);
    if (sl?.score) parts.push(`sleep ${sl.score}`);
    return parts.join(", ");
  } catch {
    return null;
  }
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

function anthro() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function generate(system: string, user: string, effort: string) {
  const response = await anthro().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ thinking: { type: "adaptive" }, output_config: { effort } } as any),
    system,
    messages: [{ role: "user", content: user }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const utcHour = new Date().getUTCHours();
  const phase = url.searchParams.get("phase") ?? (utcHour < 6 ? "evening" : "morning");
  const supabase = getSupabase();
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "workout-coach-lac.vercel.app";

  // ---------------- EVENING: tomorrow's plan ----------------
  if (phase === "evening") {
    // Fold in the day's chat, then refresh the training log.
    await fetch(`https://${host}/api/consolidate`, { cache: "no-store" }).catch(() => null);
    await fetch(`https://${host}/api/strava/sync`, { method: "POST", cache: "no-store" }).catch(() => null);

    const reviewNight = etWeekday(1) === "Mon" || url.searchParams.get("review") === "1";
    const title = reviewNight
      ? `Weekly review · week of ${fmtShort(1)}`
      : `Tomorrow · ${etWeekday(1)} ${fmtShort(1)}`;

    const { data: existing } = await supabase
      .from("sessions").select("id").eq("title", title).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ created: false, reason: "already exists" });
    }

    const [system, oura, aggregates] = await Promise.all([
      buildSystemPrompt(),
      ouraToday(),
      reviewNight ? weeklyAggregates(supabase) : Promise.resolve(""),
    ]);
    const ouraLine = oura
      ? `Today's Oura (recovery trend context; fresh readiness lands tomorrow morning): ${oura}.`
      : "(No Oura data today.)";

    const user = reviewNight
      ? `It is ${etWeekday(0)} evening. Write my weekly review and the plan for the week starting tomorrow (${etDate(1)}). ${ouraLine}

Hard numbers for the week (computed from the log - reckon with these, do not re-derive):
${aggregates}

Structure:
1. Last week by the numbers - interpret the aggregates vs the rotation's intent. Flag any load spike over ~25% week-over-week.
2. What went well - tie to specific logged numbers and benchmarks. Call out PRs or firsts.
3. What needs work - max 3 items, each specific and fixable this week. Audit zone discipline with the HR data.
4. Week ahead - commitments: what progresses (exact new loads/targets), what holds, deload check, gates approaching.
5. Template audit: walk the [COVERAGE] checklist line by line against the current rotation - every movement pattern and every within-muscle region for goal-linked muscles - and name each gap found. Then weekly sets per muscle vs targets, progression stalls, and proposed changes; a deliberate mesocycle change every 4-6 weeks is expected.
6. Any decision I need to make this week - or none.
7. Tomorrow's session in full (completeness rules apply).`
      : `It is ${etWeekday(0)} evening. Write tomorrow's session plan (${etWeekday(1)} ${etDate(1)}). ${ouraLine}

Include:
1. One-line read on recovery trend and training load.
2. Which rotation session is up tomorrow - based only on what the log confirms. If today's planned session has no log entry yet, say so and make the plan conditional on it.
3. The full session prescription, targets anchored to logged numbers (completeness rules apply).
4. A contingency option.
Keep it tight - I'm reading this the night before.`;

    const text = await generate(system, user, reviewNight ? "high" : "medium");
    if (!text) return NextResponse.json({ created: false, reason: "empty response" });

    const { data: session, error } = await supabase
      .from("sessions").insert({ title }).select().single();
    if (error || !session) {
      return NextResponse.json({ error: error?.message }, { status: 500 });
    }
    await supabase
      .from("messages")
      .insert({ role: "assistant", content: text, session_id: session.id });
    return NextResponse.json({ created: true, phase, title, oura: !!oura });
  }

  // ---------------- MORNING: readiness check on today's plan ----------------
  const oura = await ouraToday();
  if (!oura) {
    return NextResponse.json({ posted: false, reason: "no oura data this morning" });
  }

  // Find last night's plan for today
  const candidates = [
    `Tomorrow · ${etWeekday(0)} ${fmtShort(0)}`,
    `Weekly review · week of ${fmtShort(0)}`,
  ];
  const { data: sess } = await supabase
    .from("sessions").select("id,title").in("title", candidates).limit(1);
  const planSession = sess?.[0] ?? null;

  let planText = "";
  if (planSession) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("content,role")
      .eq("session_id", planSession.id)
      .order("created_at", { ascending: true });
    // Idempotency: only one readiness post per morning
    if ((msgs ?? []).some((m) => m.content.startsWith("Morning readiness"))) {
      return NextResponse.json({ posted: false, reason: "already posted" });
    }
    planText = (msgs ?? []).filter((m) => m.role === "assistant").map((m) => m.content).join("\n\n");
  }

  const system = await buildSystemPrompt();
  const user = `It is ${etWeekday(0)} morning, ${etDate(0)}. Fresh Oura: ${oura}.
${planText ? `Last night's plan for today:\n---\n${planText.slice(0, 6000)}\n---` : "(No plan was published last night.)"}

Start your reply with exactly "Morning readiness:" then, in at most 6 sentences: the readiness verdict, and either "plan stands" or the specific adjustment (volume cut, intensity swap to zone 2, or rest) per [RECOVERY]. ${planText ? "" : "Since there is no plan, state which rotation session is up today in one line."}`;

  const text = await generate(system, user, "medium");
  if (!text) return NextResponse.json({ posted: false, reason: "empty response" });

  let sessionId = planSession?.id;
  if (!sessionId) {
    const { data: s2 } = await supabase
      .from("sessions").insert({ title: `Morning readiness · ${fmtShort(0)}` }).select().single();
    sessionId = s2?.id;
  }
  if (!sessionId) return NextResponse.json({ posted: false, reason: "no session" });

  await supabase
    .from("messages")
    .insert({ role: "assistant", content: text, session_id: sessionId });
  return NextResponse.json({ posted: true, phase, session: sessionId });
}
