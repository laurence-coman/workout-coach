import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// In-app improvement notes: jot from any device, triaged in dev sessions.
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const supabase = getSupabase();
  let q = supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!all) q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { note } = await req.json();
  if (!note || typeof note !== "string") {
    return NextResponse.json({ error: "note required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { error } = await supabase.from("feedback").insert({ note });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
