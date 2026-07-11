import { getSupabase } from "./supabase";

// Builds the system prompt for every chat turn. This is the "memory":
// goals and guardrails (editable in Settings), coach notes the AI has
// saved, and the last 30 workouts (manual + Strava).
export async function buildSystemPrompt(): Promise<string> {
  const supabase = getSupabase();

  const [{ data: profile }, { data: goals }, { data: guardrails }, { data: workouts }] =
    await Promise.all([
      supabase.from("profile").select("coach_notes").eq("id", 1).single(),
      supabase
        .from("goals")
        .select("title,target,deadline,status")
        .neq("status", "dropped")
        .order("sort")
        .order("created_at"),
      supabase
        .from("guardrails")
        .select("rule,category")
        .eq("active", true)
        .order("sort")
        .order("created_at"),
      supabase
        .from("workouts")
        .select("date,type,name,duration_min,distance_km,avg_hr,effort,notes,source")
        .order("date", { ascending: false })
        .limit(30),
    ]);

  const goalList = (goals ?? [])
    .map((g) => {
      const parts = [
        g.title,
        g.target ? `target: ${g.target}` : null,
        g.deadline ? `deadline: ${g.deadline}` : null,
        g.status === "achieved" ? "[ACHIEVED]" : null,
      ].filter(Boolean);
      return "- " + parts.join(" | ");
    })
    .join("\n");

  const ruleList = (guardrails ?? [])
    .map((r) => `- [${r.category}] ${r.rule}`)
    .join("\n");

  const workoutLog = (workouts ?? [])
    .map((w) => {
      const parts = [
        w.date,
        w.type,
        w.name,
        w.duration_min ? `${w.duration_min}min` : null,
        w.distance_km ? `${w.distance_km}km` : null,
        w.avg_hr ? `avgHR ${w.avg_hr}` : null,
        w.effort ? `RPE ${w.effort}` : null,
        w.notes,
        `(${w.source})`,
      ].filter(Boolean);
      return "- " + parts.join(" | ");
    })
    .join("\n");

  return `You are a personal workout coach. Today's date is ${new Date().toISOString().slice(0, 10)}.

USER GOALS (editable by the user in Settings; manage via manage_goal only when the user asks):
${goalList || "(no goals set yet - ask about goals and save them with manage_goal)"}

GUARDRAILS - HARD RULES YOU MUST ALWAYS RESPECT:
${ruleList || "(none set)"}

YOUR SAVED COACHING NOTES:
${profile?.coach_notes || "(none yet)"}

RECENT WORKOUTS (most recent first, includes Strava/Garmin syncs):
${workoutLog || "(no workouts logged yet)"}

HOW TO BEHAVE:
- Plan workouts that fit the goals, guardrails, and recent training load shown above.
- When the user tells you about a completed workout, log it with the log_workout tool. Never log planned-only sessions.
- When you learn something durable (an injury, a preference, a PR, a schedule constraint), save it with save_coach_note. Keep notes concise and current.
- Only add, change, or complete goals via manage_goal when the user explicitly asks or clearly confirms.
- Only add or deactivate guardrails via manage_guardrail when the user explicitly asks.
- Watch for overtraining: flag it if recent volume looks high relative to the guardrails.
- Be concise and specific. Give concrete sets/reps/paces, not generic advice.`;
}
