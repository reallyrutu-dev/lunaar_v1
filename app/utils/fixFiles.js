const GATEWAY_URL =
    process.env.AI_GATEWAY_URL || "https://ai-gateway.vercel.sh/v1/chat/completions"
const REPAIR_TIMEOUT_MS = Number(process.env.AI_REPAIR_TIMEOUT_MS) || 60000
const REPAIR_MAX_TOKENS = Number(process.env.AI_REPAIR_MAX_TOKENS) || 16384
const AZURE_REASONING_EFFORT = String(process.env.AZURE_REASONING_EFFORT || "low").toLowerCase()
const MAX_FILE_CHARS = 40000
const MAX_TOTAL_CHARS = 120000
const MAX_ATTEMPTS = 2

const SYSTEM = [
    "You fix errors in an Expo React Native (TypeScript) project that must run in Expo Snack.",
    "You get a list of errors and the full content of the files that contain them.",
    "Keep every feature. Change only what is needed to remove the errors.",
    "If a package is not allowed or does not exist, delete every import of it and remove it from mobile/package.json.",
    "If a package is imported but missing from package.json, add it to dependencies in mobile/package.json.",
    "If an import points to a file that does not exist, create that file with complete working content, or fix the import path when the file exists under another path listed in OTHER FILES.",
    "If a name is imported from a file that does not export it, add the export in the file that should export it, or import a name that exists.",
    "If a default import has no default export, switch to a named import or add the default export.",
    "If a component is used in JSX but never imported or defined, import it from the correct file or define it.",
    "If required exports are missing from mobile/components/ui.tsx or mobile/constants/theme.ts, add them with complete working implementations that read from useTheme().",
    "Never import react-native-url-polyfill, expo-router, react-native-reanimated or react-native-gesture-handler.",
    "You may return new files. Return every file you change or create in full, never fragments.",
    'Reply with one JSON object and nothing else: {"files": [{"path": "...", "content": "..."}]}.',
    "No markdown fences, no explanation.",
].join(" ")

const splitList = (value, fallback) =>
    String(value || fallback)
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)

const parseProviders = (value) =>
    splitList(value, "")
        .map((entry) => {
            const parts = entry.split("|")
            return {
                url: parts[0]?.trim(),
                model: parts.slice(1, parts.length > 2 ? -1 : undefined).join("|").trim(),
                keyEnv: parts.length > 2 ? parts[parts.length - 1].trim() : null,
            }
        })
        .filter((p) => p.url && p.model)

const repairProviders = () => {
    const primary = parseProviders(process.env.AI_GATEWAY_PROVIDERS)
    const models = splitList(
        process.env.AI_REPAIR_MODELS || process.env.AI_GATEWAY_MODELS,
        "deepseek/deepseek-v4-flash"
    )
    return [...primary, ...models.map((model) => ({ url: GATEWAY_URL, model, keyEnv: null }))]
}

const isAzureUrl = (url) => {
    try {
        return new URL(String(url || "").trim()).hostname.toLowerCase().endsWith(".azure.com")
    } catch {
        return false
    }
}

const resolveEndpoint = (url) => {
    const clean = String(url || "").trim()
    if (clean.includes("/chat/completions")) return clean
    if (isAzureUrl(clean)) return `${new URL(clean).origin}/openai/v1/chat/completions`
    return `${clean.replace(/\/+$/, "")}/chat/completions`
}

const PATH_IN_TEXT = /\b((?:mobile|backend)\/[\w./@-]+\.(?:js|jsx|ts|tsx|json))/
const PATHS_IN_TEXT = /\b((?:mobile|backend)\/[\w./@-]+\.(?:js|jsx|ts|tsx|json))/g
const STRING_ERROR = /^\s*((?:mobile|backend)\/[^\s:]+)(?::(\d+))?(?::\d+)?:\s*([\s\S]*)$/

const normalizeError = (e) => {
    if (typeof e === "string") {
        const m = e.match(STRING_ERROR)
        if (m) return { path: m[1], line: Number(m[2]) || null, message: m[3].trim(), source: "" }
        return { path: e.match(PATH_IN_TEXT)?.[1] || "", line: null, message: e, source: "" }
    }
    const message = String(e?.message ?? "Unknown problem")
    return {
        path: String(e?.path ?? e?.file ?? "") || message.match(PATH_IN_TEXT)?.[1] || "",
        line: Number(e?.line) || null,
        message,
        source: String(e?.source ?? ""),
    }
}

const isDesignProblem = (e) => /^design[.\s]/i.test(e.message)

const errorLine = (e) => {
    const where = e.path ? `${e.path}${e.line ? `:${e.line}` : ""}` : "unknown file"
    return `- ${where}: ${e.message}`
}

const around = (content, line) => {
    if (!line) return ""
    const lines = content.split("\n")
    const from = Math.max(0, line - 3)
    const to = Math.min(lines.length, line + 2)
    return lines
        .slice(from, to)
        .map((text, i) => `${from + i + 1}: ${text}`)
        .join("\n")
}

const parseFiles = (text) => {
    const clean = String(text || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim()

    let parsed
    try {
        parsed = JSON.parse(clean)
    } catch {
        const start = clean.indexOf("{")
        const end = clean.lastIndexOf("}")
        if (start < 0 || end <= start) return []
        try {
            parsed = JSON.parse(clean.slice(start, end + 1))
        } catch {
            return []
        }
    }

    const list = Array.isArray(parsed?.files) ? parsed.files : []
    return list.filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
}

const buildRequest = (provider, messages, key) => {
    const isAzure = isAzureUrl(provider.url)
    const body = { model: provider.model, messages }
    const headers = { "Content-Type": "application/json" }

    if (isAzure) {
        body.max_completion_tokens = REPAIR_MAX_TOKENS
        if (AZURE_REASONING_EFFORT && AZURE_REASONING_EFFORT !== "omit") {
            body.reasoning_effort = AZURE_REASONING_EFFORT
        }
        headers["api-key"] = key
    } else {
        body.max_tokens = REPAIR_MAX_TOKENS
        body.reasoning = { enabled: false }
        body.thinking = { type: "disabled" }
        headers.Authorization = `Bearer ${key}`
    }

    return { endpoint: resolveEndpoint(provider.url), body, headers }
}

export async function fixFiles(files, errors, options = {}) {
    const normalized = (errors || []).map(normalizeError).filter((e) => !isDesignProblem(e))
    if (!files.length || normalized.length === 0) return []

    const byPath = new Map(files.map((f) => [f.path, f]))

    const failingPaths = new Set()
    for (const e of normalized) {
        if (e.path && byPath.has(e.path)) failingPaths.add(e.path)
        for (const m of e.message.matchAll(PATHS_IN_TEXT)) {
            if (byPath.has(m[1])) failingPaths.add(m[1])
        }
    }

    const needsPackageJson = normalized.some(
        (e) => e.source === "packages" || /package\.json|package "/i.test(e.message)
    )
    if (needsPackageJson && byPath.has("mobile/package.json")) failingPaths.add("mobile/package.json")

    let total = 0
    const failing = []
    for (const p of failingPaths) {
        const file = byPath.get(p)
        if (!file || file.content.length > MAX_FILE_CHARS) continue
        if (total + file.content.length > MAX_TOTAL_CHARS) break
        total += file.content.length
        failing.push(file)
    }

    if (failing.length === 0) {
        console.log(
            "fixFiles: no failing file could be matched for:",
            normalized.slice(0, 3).map((e) => e.message.slice(0, 120))
        )
        return []
    }

    const errorBlock = normalized
        .map((e) => {
            const file = byPath.get(e.path)
            const snippet = file ? around(file.content, e.line) : ""
            return snippet ? `${errorLine(e)}\n${snippet}` : errorLine(e)
        })
        .join("\n")

    const fileBlock = failing.map((f) => `--- ${f.path}\n${f.content}`).join("\n\n")
    const otherPaths = files
        .map((f) => f.path)
        .filter((p) => !failingPaths.has(p))
        .slice(0, 60)
        .join("\n")

    const messages = [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `ERRORS:\n${errorBlock}\n\nFAILING FILES:\n${fileBlock}\n\nOTHER FILES (paths only):\n${otherPaths}`,
        },
    ]

    const providers = repairProviders().slice(0, MAX_ATTEMPTS)

    for (const provider of providers) {
        const key = provider.keyEnv ? process.env[provider.keyEnv] : process.env.AI_GATEWAY_API_KEY
        if (!key) {
            console.log("fixFiles: no API key for", provider.url)
            continue
        }

        try {
            const { endpoint, body, headers } = buildRequest(provider, messages, key)
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REPAIR_TIMEOUT_MS),
            })

            if (!res.ok) {
                const detail = await res.text().catch(() => "")
                console.log(
                    "fixFiles request failed:",
                    provider.model,
                    "status",
                    res.status,
                    "endpoint",
                    endpoint,
                    detail.slice(0, 300)
                )
                continue
            }

            const data = await res.json()
            const choice = data?.choices?.[0]
            console.log(
                "fixFiles usage:",
                provider.model,
                JSON.stringify(data?.usage || {}),
                "finish:",
                choice?.finish_reason
            )
            options.onUsage?.(data?.usage)

            const changed = parseFiles(choice?.message?.content).filter(
                (f) => byPath.get(f.path)?.content !== f.content
            )
            if (changed.length > 0) return changed

            console.log(
                "fixFiles: model returned no changed files, finish:",
                choice?.finish_reason,
                "chars:",
                String(choice?.message?.content || "").length
            )
        } catch (e) {
            console.log("fixFiles error:", provider.model, e?.message)
        }
    }

    return []
}