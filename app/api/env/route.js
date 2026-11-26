import { NextResponse } from "next/server"
import supabase from "../../utils/supabase"
import { encryptApiKey } from "../../utils/crypto"

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/
const RESERVED = ["PORT", "NODE_ENV"]

const authenticate = async (request) => {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return null
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user.id
}

const loadChat = async (chat_id, user_id) => {
    const { data } = await supabase
        .from("chats")
        .select("chat_id, env_vars")
        .eq("chat_id", chat_id)
        .eq("user_id", user_id)
        .maybeSingle()
    return data
}

export async function GET(request) {
    const user_id = await authenticate(request)
    if (!user_id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const chat_id = new URL(request.url).searchParams.get("chat_id")
    const chat = await loadChat(chat_id, user_id)
    if (!chat) return NextResponse.json({ message: "Chat not found" }, { status: 404 })

    return NextResponse.json({ keys: Object.keys(chat.env_vars || {}) })
}

export async function POST(request) {
    const user_id = await authenticate(request)
    if (!user_id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { chat_id, vars = {}, remove = [] } = await request.json()
    const chat = await loadChat(chat_id, user_id)
    if (!chat) return NextResponse.json({ message: "Chat not found" }, { status: 404 })

    const current = { ...(chat.env_vars || {}) }

    for (const [rawKey, value] of Object.entries(vars)) {
        const key = rawKey.trim().toUpperCase()
        if (!KEY_RE.test(key) || RESERVED.includes(key) || key.startsWith("RENDER_")) {
            return NextResponse.json({ message: `Invalid variable name: ${rawKey}` }, { status: 400 })
        }
        if (value === "" || value === undefined || value === null) continue
        current[key] = encryptApiKey(String(value))
    }

    for (const key of remove) delete current[key]

    const { error } = await supabase
        .from("chats")
        .update({ env_vars: current })
        .eq("chat_id", chat_id)
        .eq("user_id", user_id)

    if (error) return NextResponse.json({ message: error.message }, { status: 500 })

    return NextResponse.json({ keys: Object.keys(current) })
}