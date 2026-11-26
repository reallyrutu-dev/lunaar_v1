import { NextResponse } from "next/server"
import supabase from "../../utils/supabase"
import crypto from "crypto"

const ALGORITHM = "aes-256-cbc"
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.MASTER_SECRET || "fallback-dev-secret-do-not-use-in-prod",
    "salt",
    32
)

function encryptApiKey(text) {
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


const verifyRenderKey = async (apiKey) => {
    try {
        const res = await fetch("https://api.render.com/v1/owners?limit=1", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
        })
        if (res.ok) return { valid: true }
        if (res.status === 401) return { valid: false, reason: "Invalid API key" }
        return { valid: false, reason: `Render returned ${res.status}` }
    } catch {
        return { valid: false, reason: "Could not reach Render" }
    }
}

export async function POST(request) {
    try {
        const user_id = await getUserId(request)
        if (!user_id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const key = String(body.api_key ?? body.apiKey ?? "").trim()
        if (key.length < 5) {
            return NextResponse.json({ error: "API key is too short" }, { status: 400 })
        }

        const check = await verifyRenderKey(key)
        console.log(check.reason)
        if (!check.valid) {
            console.log(check.reason)
            return NextResponse.json({ error: check.reason }, { status: 400 })
        }

        const { error } = await supabase
            .from("user_api_keys")
            .upsert(
                { user_id, encrypted_render_key: encryptApiKey(key) },
                { onConflict: "user_id" }
            )

        if (error) {
            console.error(error)
            return NextResponse.json({ error: "Failed to save key" }, { status: 500 })
        }

        return NextResponse.json({ message: "Successfully added Render API key" })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: "Server error" }, { status: 500 })
    }
}