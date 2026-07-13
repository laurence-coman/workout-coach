import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Nightly memory consolidation, triggered by Vercel cron (see vercel.json).
// Reads the last day of chat and folds anything durable into coach notes,
// so nothing important is lost when old messages age out of the context window.
export async function GET(req: Request) {
  // If CRON_SECRET is set in Vercel env, require it (Vercel sends it automatically).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const { data: msgs } = await supabase
    .from("messages")
    .select("role,content,created_at")
    .gte("created_at", since)
    .order("created_at");

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ consolidated: false, reason: "no recent messages" });
  }

  const { data: profile } = await supabase
    .from("profile")
    .select("coach_notes")
    .eq("id", 1)
    .single();

  const transcript = msgs
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n---\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    // Memory rewrites are high-stakes: use the heavyweight model.
    model: "claude-opus-4-8",
    max_tokens: 12000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ thinking: { type: "adaptive" }, output_config: { effort: "high" } } as any),
    system: `You maintain the long-term memory of a personal workout coach. Given the CURRENT NOTES and the LAST DAY OF CHAT, return the complete revised notes.
Rules:
- Preserve all existing sections and facts unless the chat explicitly corrected them.
- Fold in NEW durable information from the chat: benchmarks, PRs, injury status changes, preferences, schedule constraints, equipment, decisions.
- Do not add transient chatter, individual workout logs (those live in the workouts table), or duplicates of existing facts.
- Keep the same plain-text section format. Stay under 6000 characters; condense the oldest low-value details if needed.
- Return ONLY the revised notes text, nothing else.`,
    messages: [
      {
        role: "user",
        content: `CURRENT NOTES:\n${profile?.coach_notes ?? ""}\n\nLAST DAY OF CHAT:\n${transcript}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Guard against a bad model response wiping the notes.
  const current = profile?.coach_notes ?? "";
  if (!text || text.length < Math.min(500, current.length * 0.5)) {
    return NextResponse.json({ consolidated: false, reason: "model response too short; notes unchanged" });
  }

  await supabase
    .from("profile")
    .update({ coach_notes: text, updated_at: new Date().toISOString() })
    .eq("id", 1);

  return NextResponse.json({ consolidated: true, notesLength: text.length, messagesSeen: msgs.length });
}
