import { NextResponse } from "next/server"
import supabase from "../../utils/supabase"
import { decryptApiKey } from "../../utils/crypto"
import { deployToRender } from "../../utils/render"

export async function POST(request) {
    try {
        const token = request.headers.get("authorization")?.replace("Bearer ", "")
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

        const { data: authData, error: authError } = await supabase.auth.getUser(token)
        if (authError || !authData?.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
        }
        const user_id = authData.user.id

        const { chat_id } = await request.json()
        if (!chat_id || String(chat_id).trim().length < 4) {
            return NextResponse.json({ message: "Invalid chat_id" }, { status: 400 })
        }

        const { data: keys, error: keysError } = await supabase
            .from("user_api_keys")
            .select("render_api_key, supabase_url, supabase_service_key")
            .eq("user_id", user_id)
            .maybeSingle()

        if (keysError) return NextResponse.json({ message: keysError.message }, { status: 500 })
        if (!keys?.render_api_key) return NextResponse.json({ message: "No Render API key" }, { status: 400 })

        const { data: chat, error: chatError } = await supabase
            .from("chats")
            .select("*")
            .eq("chat_id", chat_id)
            .eq("user_id", user_id)
            .maybeSingle()

        if (chatError) return NextResponse.json({ message: chatError.message }, { status: 500 })
        if (!chat) return NextResponse.json({ message: "Chat not found" }, { status: 404 })

        const renderKey = decryptApiKey(keys.render_api_key)

        const customVars = Object.fromEntries(
            Object.entries(chat.env_vars || {}).map(([key, value]) => [key, decryptApiKey(value)])
        )

        const envVars = {
            ...customVars,
            NODE_ENV: "production",
            SUPABASE_URL: keys.supabase_url,
            SUPABASE_SERVICE_ROLE_KEY: keys.supabase_service_key
                ? decryptApiKey(keys.supabase_service_key)
                : undefined,
        }

        const result = await deployToRender(renderKey, {
            serviceId: chat.render_service_id,
            name: chat.title,
            repoUrl: chat.repo_url,
            envVars,
        })

        if (result.created) {
            const { error: updateError } = await supabase
                .from("chats")
                .update({ render_service_id: result.serviceId, render_url: result.url })
                .eq("chat_id", chat_id)

            if (updateError) {
                return NextResponse.json({ message: updateError.message }, { status: 500 })
            }
        }

        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json({ message: err.message || "Deploy failed" }, { status: 500 })
    }
}