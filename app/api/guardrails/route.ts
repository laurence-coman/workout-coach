import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("guardrails")
    .select("*")
    .order("sort")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.rule) {
    return NextResponse.json({ error: "rule required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("guardrails")
    .insert({
      rule: body.rule,
      category: body.category ?? "general",
      active: body.active ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  const updates: Record<string, unknown> = {};
  for (const key of ["rule", "category", "active", "sort"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  const { error } = await supabase.from("guardrails").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.from("guardrails").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
