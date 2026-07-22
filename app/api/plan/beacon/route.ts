import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// sendBeacon target: same as PATCH /api/plan but POST-only, used to flush
// an unsaved draft when the page is backgrounded or closed.
export async function POST(req: Request) {
  try {
    const { plan_id, draft } = await req.json();
    if (!plan_id || !draft) return NextResponse.json({ ok: false }, { status: 400 });
    const supabase = getSupabase();
    await supabase
      .from("plans")
      .update({ entries: draft })
      .eq("id", plan_id)
      .eq("status", "active");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
