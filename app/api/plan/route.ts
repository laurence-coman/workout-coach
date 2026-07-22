import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PlanItem = { name: string; prescription: string; cues?: string; tag?: string };
type Draft = {
  entries?: Record<string, string>;
  done?: Record<string, boolean>;
  rpe?: number | null;
  pain?: number | null;
  t?: number;
};

// "Bench press (close grip)" -> "bench press" for cross-session matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Build "last time you did this exercise" lookup from (a) completed plans'
// saved entries and (b) structured exercises parsed from prose workout logs.
async function buildLastResults(
  supabase: ReturnType<typeof getSupabase>,
  items: PlanItem[],
  excludePlanId: string
): Promise<Record<string, string>> {
  const wanted = new Map(items.map((it) => [normalize(it.name), it.name]));
  const candidates: { key: string; text: string; date: string }[] = [];

  const [{ data: plans }, { data: workouts }] = await Promise.all([
    supabase
      .from("plans")
      .select("items, entries, completed_at, date")
      .eq("status", "completed")
      .neq("id", excludePlanId)
      .order("completed_at", { ascending: false })
      .limit(30),
    supabase
      .from("workouts")
      .select("date, exercises")
      .not("exercises", "is", null)
      .order("date", { ascending: false })
      .limit(120),
  ]);

  for (const p of plans ?? []) {
    const draft = (p.entries ?? {}) as Draft;
    const entryMap = draft.entries ?? {};
    const date = (p.completed_at ?? p.date ?? "").slice(0, 10);
    for (const it of (p.items ?? []) as PlanItem[]) {
      const result = (entryMap[it.name] ?? "").trim();
      if (result) candidates.push({ key: normalize(it.name), text: result, date });
    }
  }
  for (const w of workouts ?? []) {
    for (const ex of (w.exercises ?? []) as { name: string; detail: string }[]) {
      if (ex?.name && ex?.detail)
        candidates.push({ key: normalize(ex.name), text: ex.detail, date: w.date });
    }
  }

  candidates.sort((a, b) => (a.date < b.date ? 1 : -1));

  const out: Record<string, string> = {};
  for (const [key, original] of wanted) {
    const hit =
      candidates.find((c) => c.key === key) ??
      candidates.find(
        (c) => key.length > 4 && (c.key.includes(key) || key.includes(c.key))
      );
    if (hit) out[original] = `${hit.text} (${fmtDate(hit.date)})`;
  }
  return out;
}

export async function GET() {
  const supabase = getSupabase();
  const [{ data: active }, { data: last }] = await Promise.all([
    supabase.from("plans").select("*").eq("status", "active")
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("plans").select("*").eq("status", "completed")
      .order("completed_at", { ascending: false }).limit(1),
  ]);
  const activePlan = active?.[0] ?? null;
  const lastResults = activePlan
    ? await buildLastResults(supabase, activePlan.items as PlanItem[], activePlan.id)
    : {};
  return NextResponse.json({
    active: activePlan,
    last: last?.[0] ?? null,
    lastResults,
  });
}

// Autosave: persist in-progress entries so switching tabs/pages never loses data.
export async function PATCH(req: Request) {
  const { plan_id, draft } = await req.json();
  if (!plan_id || !draft)
    return NextResponse.json({ error: "plan_id and draft required" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase
    .from("plans")
    .update({ entries: draft })
    .eq("id", plan_id)
    .eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Complete the active plan: compiles per-exercise results into one workout
// log entry (auto-logged), then closes the plan.
export async function POST(req: Request) {
  const { plan_id, entries, rpe, pain, duration_min } = await req.json();
  if (!plan_id) return NextResponse.json({ error: "plan_id required" }, { status: 400 });

  const supabase = getSupabase();
  const { data: plan } = await supabase
    .from("plans").select("*").eq("id", plan_id).single();
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  // Fall back to the server-saved draft if the client sent nothing
  const serverDraft = (plan.entries ?? {}) as Draft;
  const entryMap: Record<string, string> =
    entries && Object.keys(entries).length > 0 ? entries : serverDraft.entries ?? {};
  const finalRpe = rpe ?? serverDraft.rpe ?? null;
  const finalPain = pain ?? serverDraft.pain ?? null;

  const lines = (plan.items as PlanItem[]).map((it) => {
    const result = (entryMap[it.name] ?? "").trim();
    return `${it.name}: ${result || "(not logged)"}`;
  });
  if (finalPain !== undefined && finalPain !== null)
    lines.push(`Foot pain ${finalPain}/10 during`);
  const notes = lines.join(". ") + ".";

  // Structured copy so future "Last:" lookups don't depend on prose parsing
  const exercises = (plan.items as PlanItem[])
    .map((it) => ({ name: it.name, detail: (entryMap[it.name] ?? "").trim() }))
    .filter((e) => e.detail);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({
      date: today,
      type: plan.type ?? "lift",
      name: plan.title,
      duration_min: duration_min ?? null,
      effort: finalRpe,
      notes,
      exercises: exercises.length > 0 ? exercises : null,
      source: "manual",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("plans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      workout_id: workout.id,
      entries: { entries: entryMap, rpe: finalRpe, pain: finalPain },
    })
    .eq("id", plan_id);

  return NextResponse.json({ ok: true, workout_id: workout.id });
}
