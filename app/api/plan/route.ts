import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PlanItem = { name: string; prescription: string; cues?: string; tag?: string };

export async function GET() {
  const supabase = getSupabase();
  const [{ data: active }, { data: last }] = await Promise.all([
    supabase.from("plans").select("*").eq("status", "active")
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("plans").select("*").eq("status", "completed")
      .order("completed_at", { ascending: false }).limit(1),
  ]);
  return NextResponse.json({ active: active?.[0] ?? null, last: last?.[0] ?? null });
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

  const entryMap: Record<string, string> = entries ?? {};
  const lines = (plan.items as PlanItem[]).map((it) => {
    const result = (entryMap[it.name] ?? "").trim();
    return `${it.name}: ${result || "(not logged)"}`;
  });
  if (pain !== undefined && pain !== null) lines.push(`Foot pain ${pain}/10 during`);
  const notes = lines.join(". ") + ".";

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({
      date: today,
      type: plan.type ?? "lift",
      name: plan.title,
      duration_min: duration_min ?? null,
      effort: rpe ?? null,
      notes,
      source: "manual",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("plans")
    .update({ status: "completed", completed_at: new Date().toISOString(), workout_id: workout.id })
    .eq("id", plan_id);

  return NextResponse.json({ ok: true, workout_id: workout.id });
}
