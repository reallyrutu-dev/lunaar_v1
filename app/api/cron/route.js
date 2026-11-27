import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request) {
    const auth = request.headers.get("authorization")
    
    try {
        return NextResponse.json({ ok: true, ran_at: new Date().toISOString() })
    } catch (e) {
        console.log("cron error:", e?.message)
        return NextResponse.json({ error: "Job failed" }, { status: 500 })
    }
}