import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .select("id,title,created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .insert({ title: null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { id, title } = await req.json();
  if (!id || !title) {
    return NextResponse.json({ error: "id and title required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("sessions")
    .update({ title: String(title).slice(0, 80) })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  await supabase.from("messages").delete().eq("session_id", id);
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
