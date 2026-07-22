import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Parses prose lift-workout notes into structured exercises [{name, detail}]
// so the Workout tab can show per-exercise history. Idempotent: only touches
// rows where exercises is null. Safe to re-run any time.
const SYSTEM = `Parse a workout log into structured exercises. Return ONLY a JSON array, no prose:
[{"name": "Bench press", "detail": "195x2, then 175x5x3"}, ...]
Rules:
- name: canonical exercise name, capitalized, no parentheticals unless needed to disambiguate (e.g. "T-bar row").
- detail: the sets/reps/weight/result exactly as recorded, compact. Include felt/RPE notes for that exercise if present.
- Skip general session commentary, pain scores, and anything that isn't a specific exercise.
- If an exercise is named with no numbers, include it with the detail available (e.g. "3 rounds").
- Empty array if nothing parseable.`;

export async function GET() {
  const supabase = getSupabase();
  const anthropic = new Anthropic();

  const { data: rows } = await supabase
    .from("workouts")
    .select("id, date, name, notes")
    .eq("type", "lift")
    .eq("source", "manual")
    .is("exercises", null)
    .not("notes", "is", null)
    .order("date", { ascending: false })
    .limit(40);

  const results: string[] = [];
  for (const row of rows ?? []) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Workout: ${row.name} (${row.date})\nLog: ${row.notes}`,
          },
        ],
        ...({
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
        } as any),
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const exercises = JSON.parse(
        text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)
      );
      if (!Array.isArray(exercises) || exercises.length === 0) {
        // Mark as processed-empty so re-runs skip it
        await supabase.from("workouts").update({ exercises: [] }).eq("id", row.id);
        results.push(`none: ${row.date} ${row.name}`);
        continue;
      }
      await supabase.from("workouts").update({ exercises }).eq("id", row.id);
      results.push(`ok: ${row.date} ${row.name} -> ${exercises.length}`);
    } catch (e) {
      results.push(`fail: ${row.date} ${row.name} (${String(e).slice(0, 80)})`);
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
