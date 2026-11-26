import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runMigration } from "../tools";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const sql = String(body.sql || "").trim();
    if (!sql) {
      return NextResponse.json({ error: "SQL is required" }, { status: 400 });
    }

    const result = await runMigration(user.id, sql, true, body.confirm_destructive === true);

    if (result.status === "rejected") {
      return NextResponse.json(result, { status: 400 });
    }
    if (result.status === "needs_approval") {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("approve failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed" },
      { status: 500 }
    );
  }
}