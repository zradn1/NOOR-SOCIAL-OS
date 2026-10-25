import { sql } from "kysely";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";

/** Liveness and database reachability. Reveals no configuration details. */
export async function GET() {
  try {
    await sql`select 1`.execute(getDb());
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
