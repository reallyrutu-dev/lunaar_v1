export async function streamChat({ token, user_message, chat_id, signal, onEvent, images, imgs }) {
        const outgoing = images ?? imgs ?? []

        console.log("[img] streamChat sending:", outgoing.length, outgoing)

    const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_message, chat_id, images: images ?? imgs ?? [] }),
        signal,
    })

    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Request failed")
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let result = null

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split("\n\n")
        buffer = events.pop()

        for (const raw of events) {
            const line = raw.split("\n").find((l) => l.startsWith("data:"))
            if (!line) continue

            let event
            try {
                event = JSON.parse(line.slice(5))
            } catch {
                continue
            }

            if (event.type === "done") result = event
            else if (event.type === "error") throw new Error(event.error || "Request failed")
            else onEvent?.(event)
        }
    }

    if (!result) throw new Error("Connection closed before the reply finished")
    return result
}