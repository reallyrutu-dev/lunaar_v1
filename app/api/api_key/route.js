import crypto from "crypto"
import supabase from "../../utils/supabase.js"
import { NextResponse } from "next/server"

const ALGORITHM = "aes-256-cbc"
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.MASTER_SECRET || "fallback-dev-secret-do-not-use-in-prod",
    "salt",
    32
)

const PROVIDERS = ["gemini", "groq"]

export function encryptApiKey(text) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")
    return `${iv.toString("hex")}:${encrypted}`
}

async function getUserId(request) {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return null
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user.id
}

async function verifyKey(provider, key) {
    try {
        const res =
            provider === "groq"
                ? await fetch("https://api.groq.com/openai/v1/models", {
                      headers: { Authorization: `Bearer ${key}` },
                  })
                : await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
                      headers: { "x-goog-api-key": key },
                  })
        if (res.ok) return "valid"
        if (res.status === 400 || res.status === 401 || res.status === 403) return "invalid"
        return "unreachable"
    } catch {
        return "unreachable"
    }
}

export async function POST(request) {
    try {
        const user_id = await getUserId(request)
        if (!user_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const apiKey = String(body.apiKey || "").trim()
        const provider = String(body.provider || "").toLowerCase()

        if (!PROVIDERS.includes(provider)) {
            return NextResponse.json({ error: "Provider must be gemini or groq" }, { status: 400 })
        }
        if (apiKey.length < 10) {
            return NextResponse.json({ error: "That does not look like a valid API key" }, { status: 400 })
        }

        const verdict = await verifyKey(provider, apiKey)
        if (verdict === "invalid") {
            return NextResponse.json({ error: `That key was rejected by ${provider}` }, { status: 400 })
        }
        if (verdict === "unreachable") {
            return NextResponse.json(
                { error: `Could not reach ${provider} to check the key. Try again.` },
                { status: 502 }
            )
        }

        const { error: delete_err } = await supabase.from("user_api_keys").delete().eq("user_id", user_id)
        if (delete_err) throw delete_err

        const { error: insert_err } = await supabase
            .from("user_api_keys")
            .upsert({ user_id, encrypted_key: encryptApiKey(apiKey), provider })
        if (insert_err) throw insert_err

        return NextResponse.json({ connected: true, provider })
    } catch (e) {
        console.log("save key error:", e?.message)
        return NextResponse.json({ error: "Could not save the key" }, { status: 500 })
    }
}

export async function GET(request) {
    try {
        const user_id = await getUserId(request)
        if (!user_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { data, error } = await supabase
            .from("user_api_keys")
            .select("provider")
            .eq("user_id", user_id)
            .limit(1)
        if (error) throw error

        if (!data || data.length === 0) {
            return NextResponse.json({ connected: false, provider: null })
        }
        return NextResponse.json({ connected: true, provider: data[0].provider })
    } catch (e) {
        console.log("read key error:", e?.message)
        return NextResponse.json({ error: "Could not read the key" }, { status: 500 })
    }
}

export async function DELETE(request) {
    try {
        const user_id = await getUserId(request)
        if (!user_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { error } = await supabase.from("user_api_keys").delete().eq("user_id", user_id)
        if (error) throw error

        return NextResponse.json({ connected: false, provider: null })
    } catch (e) {
        console.log("delete key error:", e?.message)
        return NextResponse.json({ error: "Could not remove the key" }, { status: 500 })
    }
}