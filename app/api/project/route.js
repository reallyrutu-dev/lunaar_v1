import { NextResponse } from "next/server"
import supabase from "../../utils/supabase"

export async function GET(request) {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: auth, error: auth_err } = await supabase.auth.getUser(token)
    if (auth_err || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const chat_id = new URL(request.url).searchParams.get("chat_id")
    if (!chat_id) return NextResponse.json({ error: "chat_id required" }, { status: 400 })

    const { data, error } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("user_id", auth.user.id)
        .eq("chat_id", chat_id)
        .order("path", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ files: data || [] })
}