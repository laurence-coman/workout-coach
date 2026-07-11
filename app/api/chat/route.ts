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
  save_coach_note: "Updated memory",
  manage_goal: "Updated goals",
  manage_guardrail: "Updated guardrails",
};

export async function POST(req: Request) {
  const { message } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load recent chat history for context
  const { data: history } = await supabase
    .from("messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(20);

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? [])
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  await supabase.from("messages").insert({ role: "user", content: message });

  const system = await buildSystemPrompt();
  const toolEvents: string[] = [];
  let finalText = "";

  // Agentic loop: keep going while Claude wants to use tools
  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system,
      tools,
      messages,
    });

    const textParts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);
    if (textParts.length) finalText = textParts.join("\n");

    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = await runTool(
          block.name,
          block.input as Record<string, unknown>
        );
        toolEvents.push(TOOL_LABELS[block.name] ?? block.name);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  await supabase.from("messages").insert({ role: "assistant", content: finalText });

  return NextResponse.json({ reply: finalText, toolEvents });
}
