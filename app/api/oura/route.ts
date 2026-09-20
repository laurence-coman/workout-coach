import { NextResponse } from "next/server";
import { ouraSnapshot } from "@/lib/oura";

export const dynamic = "force-dynamic";

// Debug/status endpoint: distinguishes expired token from unsynced ring.
export async function GET() {
  const snap = await ouraSnapshot();
  return NextResponse.json(snap);
}
