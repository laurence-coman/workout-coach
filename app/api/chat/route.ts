import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 60;

const tools: Anthropic.Tool[] = [
  {
    name: "log_workout",
    description:
      "Save a completed workout to the log. Use when the user reports a workout they did. Never log planned-only sessions.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        type: {
          type: "string",
          description: "run, ride, lift, swim, yoga, hike, other",
        },
        name: { type: "string", description: "Short name, e.g. 'Tempo run'" },
        duration_min: { type: "number" },
        distance_km: { type: "number" },
        avg_hr: { type: "number" },
        effort: { type: "number", description: "RPE 1-10" },
        notes: {
          type: "string",
          description:
            "Exercise order, sets/reps/loads, pain, RIR, key observations",
        },
      },
      required: ["date", "type"],
    },
  },
  {
    name: "update_workout",
    description:
      "Update fields on an existing logged workout. Use when the user corrects an entry (wrong date, load, distance, notes). Never create a duplicate for a correction.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workout id from the [id:...] tag in RECENT WORKOUTS",
        },
        date: { type: "string", description: "YYYY-MM-DD" },
        type: { type: "string" },
        name: { type: "string" },
        duration_min: { type: "number" },
        distance_km: { type: "number" },
        avg_hr: { type: "number" },
        effort: { type: "number" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_workout",
    description:
      "Delete a logged workout entry. Only when the user explicitly asks to remove it (e.g. a duplicate). Confirm first if ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workout id from the [id:...] tag in RECENT WORKOUTS",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "save_coach_note",
    description:
      "Replace the saved coaching notes with an updated version. Use for durable facts learned in conversation (injuries, PRs, preferences, constraints, benchmarks). Always pass the FULL revised notes text, not just the addition.",
    input_schema: {
      type: "object",
      properties: {
        coach_notes: { type: "string", description: "Full revised notes" },
      },
      required: ["coach_notes"],
    },
  },
  {
    name: "manage_goal",
    description:
      "Add, update, or change the status of a training goal. Only use when the user explicitly asks or clearly confirms a goal change.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "add | update | achieve | drop" },
        id: { type: "string", description: "Goal id (required for update/achieve/drop)" },
        title: { type: "string" },
        target: { type: "string", description: "Measurable target" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_guardrail",
    description:
      "Add or deactivate a hard training rule. Only use when the user explicitly asks.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "add | deactivate" },
        id: { type: "string", description: "Guardrail id (required for deactivate)" },
        rule: { type: "string" },
        category: {
          type: "string",
          description: "injury | programming | logging | nutrition | general",
        },
      },
      required: ["action"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>) {
  const supabase = getSupabase();

  if (name === "log_workout") {
    const { error } = await supabase
      .from("workouts")
      .insert({ ...input, source: "manual" });
    return error ? `Error: ${error.message}` : "Workout logged.";
  }

  if (name === "update_workout") {
    const updates: Record<string, unknown> = {};
    for (const key of ["date", "type", "name", "duration_min", "distance_km", "avg_hr", "effort", "notes"]) {
      if (input[key] !== undefined) updates[key] = input[key];
    }
    const { error } = await supabase
      .from("workouts")
      .update(updates)
      .eq("id", input.id);
    return error ? `Error: ${error.message}` : "Workout updated.";
  }

  if (name === "delete_workout") {
    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", input.id);
    return error ? `Error: ${error.message}` : "Workout deleted.";
  }

  if (name === "save_coach_note") {
    const { error } = await supabase
      .from("profile")
      .update({
        coach_notes: input.coach_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return error ? `Error: ${error.message}` : "Notes saved.";
  }

  if (name === "manage_goal") {
    const action = input.action as string;
    if (action === "add") {
      const { error } = await supabase.from("goals").insert({
        title: input.title,
        target: input.target ?? null,
        deadline: input.deadline ?? null,
      });
      return error ? `Error: ${error.message}` : "Goal added.";
    }
    if (!input.id) {
      // Try to find by title so the model doesn't need ids
      const { data } = await supabase
        .from("goals")
        .select("id")
        .ilike("title", `%${input.title ?? ""}%`)
        .limit(1);
      if (data?.[0]) input.id = data[0].id;
      else return "Error: goal not found; ask the user to edit it in Settings.";
    }
    const updates: Record<string, unknown> = {};
    if (action === "achieve") updates.status = "achieved";
    if (action === "drop") updates.status = "dropped";
    if (action === "update") {
      for (const key of ["title", "target", "deadline"]) {
        if (input[key] !== undefined) updates[key] = input[key];
      }
    }
    const { error } = await supabase.from("goals").update(updates).eq("id", input.id);
    return error ? `Error: ${error.message}` : `Goal ${action}d.`;
  }

  if (name === "manage_guardrail") {
    const action = input.action as string;
    if (action === "add") {
      const { error } = await supabase.from("guardrails").insert({
        rule: input.rule,
        category: input.category ?? "general",
      });
      return error ? `Error: ${error.message}` : "Guardrail added.";
    }
    if (!input.id) {
      const { data } = await supabase
        .from("guardrails")
        .select("id")
        .ilike("rule", `%${input.rule ?? ""}%`)
        .limit(1);
      if (data?.[0]) input.id = data[0].id;
      else return "Error: guardrail not found; ask the user to edit it in Settings.";
    }
    const { error } = await supabase
      .from("guardrails")
      .update({ active: false })
      .eq("id", input.id);
    return error ? `Error: ${error.message}` : "Guardrail deactivated.";
  }

  return "Unknown tool.";
}

const TOOL_LABELS: Record<string, string> = {
  log_workout: "Logged workout",
  update_workout: "Updated workout",
  delete_workout: "Deleted workout",
  save_coach_note: "Updated memory",
  manage_goal: "Updated goals",
  manage_guardrail: "Updated guardrails",
};

export async function POST(req: Request) {
  const { message, session_id } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load this conversation's history for context
  const { data: history } = await supabase
    .from("messages")
    .select("role,content")
    .eq("session_id", session_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? [])
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  await supabase
    .from("messages")
    .insert({ role: "user", content: message, session_id });

  // First message of a conversation becomes its title
  await supabase
    .from("sessions")
    .update({ title: message.slice(0, 64) })
    .eq("id", session_id)
    .is("title", null);

  const system = await buildSystemPrompt();

  // Stream NDJSON: {t:"d",v:delta} text chunks, {t:"tool",v:label} tool events,
  // {t:"end"} when complete. The full reply is persisted server-side at the end.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const savedParts: string[] = [];
      try {
        // Agentic loop: keep going while Claude wants to use tools
        for (let turn = 0; turn < 5; turn++) {
          const runner = anthropic.messages.stream({
            model: "claude-sonnet-5",
            max_tokens: 3000,
            system,
            tools,
            messages,
          });
          runner.on("text", (delta) => push({ t: "d", v: delta }));
          const response = await runner.finalMessage();

          const textParts = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text);
          if (textParts.length) savedParts.push(textParts.join("\n"));

          if (response.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: response.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type === "tool_use") {
              const result = await runTool(
                block.name,
                block.input as Record<string, unknown>
              );
              push({ t: "tool", v: TOOL_LABELS[block.name] ?? block.name });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            }
          }
          messages.push({ role: "user", content: toolResults });
        }

        const finalText = savedParts.join("\n\n").trim();
        if (finalText) {
          await supabase
            .from("messages")
            .insert({ role: "assistant", content: finalText, session_id });
        }
        push({ t: "end" });
      } catch (err) {
        push({ t: "err", v: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
