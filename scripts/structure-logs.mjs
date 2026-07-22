// One-time backfill: parse prose lift-workout notes into structured
// exercises [{name, detail}] so the Workout tab can show "Last:" history.
// Usage: node scripts/structure-logs.mjs   (reads .env.local)
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const rows = await fetch(
  `${SB}/rest/v1/workouts?type=eq.lift&source=eq.manual&exercises=is.null&notes=not.is.null&select=id,date,name,notes&order=date.desc`,
  { headers }
).then((r) => r.json());
console.log(`${rows.length} prose lift logs to structure`);

const SYSTEM = `Parse a workout log into structured exercises. Return ONLY a JSON array, no prose:
[{"name": "Bench press", "detail": "195x2, then 175x5x3"}, ...]
Rules:
- name: canonical exercise name, capitalized, no parentheticals unless needed to disambiguate (e.g. "T-bar row").
- detail: the sets/reps/weight/result exactly as recorded, compact. Include felt/RPE notes for that exercise if present.
- Skip general session commentary, pain scores, and anything that isn't a specific exercise.
- If an exercise is named with no numbers, include it with the detail available (e.g. "3 rounds").
- Empty array if nothing parseable.`;

for (const row of rows) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        { role: "user", content: `Workout: ${row.name} (${row.date})\nLog: ${row.notes}` },
      ],
    }),
  }).then((r) => r.json());

  const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let exercises;
  try {
    exercises = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  } catch {
    console.log(`  SKIP (unparseable): ${row.date} ${row.name}`);
    continue;
  }
  if (!Array.isArray(exercises) || exercises.length === 0) {
    console.log(`  none: ${row.date} ${row.name}`);
    continue;
  }
  const up = await fetch(`${SB}/rest/v1/workouts?id=eq.${row.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ exercises }),
  });
  console.log(`  ${up.ok ? "ok" : "FAIL"}: ${row.date} ${row.name} -> ${exercises.length} exercises`);
}
console.log("done");
