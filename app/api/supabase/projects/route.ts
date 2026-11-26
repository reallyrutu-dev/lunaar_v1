import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listProjects, selectProject, getSelectedProjectRef } from "../tools";

async function authUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  return error || !user ? null : user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await authUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [projects, selected] = await Promise.all([
      listProjects(user.id),
      getSelectedProjectRef(user.id),
    ]);

    return NextResponse.json({ projects, selected });
  } catch (e) {
    console.error("projects list failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load projects" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ref } = await req.json();
    if (!ref || typeof ref !== "string") {
      return NextResponse.json({ error: "Project ref is required" }, { status: 400 });
    }

    const result = await selectProject(user.id, ref);
    return NextResponse.json(result);
  } catch (e) {
    console.error("project select failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not select project" },
      { status: 500 }
    );
  }
}