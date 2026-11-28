import { parse } from "@babel/parser"

const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs)$/
const LOCATION_SUFFIX = /\s*\(\d+:\d+\)$/
const SANDBOX_URL = process.env.SANDBOX_URL
const SANDBOX_SECRET = process.env.SANDBOX_SECRET
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 55000
const SANDBOX_WARM_TIMEOUT_MS = Number(process.env.SANDBOX_WARM_TIMEOUT_MS) || 60000
const MAX_PROBLEMS = Number(process.env.SANDBOX_MAX_PROBLEMS) || 40
const RETRY_STATUSES = new Set([502, 503, 504])
const FAST_FAILURE_MS = 15000
const RETRY_DELAY_MS = 3000

const baseUrl = () => String(SANDBOX_URL || "").replace(/\/+$/, "")

const sandboxHost = () => {
    try {
        return new URL(baseUrl()).host
    } catch {
        return "invalid url"
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const warmSandbox = () => {
    if (!SANDBOX_URL) return
    fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(SANDBOX_WARM_TIMEOUT_MS) })
        .then((res) => console.log("sandbox warm-up:", sandboxHost(), "status", res.status))
        .catch((e) => console.log("sandbox warm-up failed:", sandboxHost(), e?.message))
}

warmSandbox()

const pluginsFor = (path) => {
    if (/\.tsx$/.test(path)) return ["jsx", "typescript"]
    if (/\.ts$/.test(path)) return ["typescript"]
    return ["jsx"]
}

const checkSyntax = (files) => {
    const problems = []
    for (const file of files) {
        if (!CODE_FILE.test(file.path) || typeof file.content !== "string") continue
        try {
            parse(file.content, {
                sourceType: "unambiguous",
                plugins: pluginsFor(file.path),
            })
        } catch (e) {
            problems.push({
                path: file.path,
                line: e.loc?.line ?? null,
                column: e.loc ? e.loc.column + 1 : null,
                message: String(e.message || "Syntax error").replace(LOCATION_SUFFIX, ""),
                source: "syntax",
            })
        }
    }
    return problems
}

const callSandbox = async (payload) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SANDBOX_TIMEOUT_MS)
    try {
        return await fetch(`${baseUrl()}/validate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-sandbox-secret": SANDBOX_SECRET,
            },
            body: payload,
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timer)
    }
}

const checkTypes = async (files) => {
    if (!SANDBOX_URL || !SANDBOX_SECRET) {
        console.log("sandbox not configured:", { hasUrl: Boolean(SANDBOX_URL), hasSecret: Boolean(SANDBOX_SECRET) })
        return [{ source: "sandbox", message: "Sandbox is not configured" }]
    }

    const payload = JSON.stringify({
        files: files
            .filter((f) => f.path.startsWith("mobile/") && typeof f.content === "string")
            .map((f) => ({ path: f.path, content: f.content })),
    })

    let last_failure = "Sandbox unreachable"

    for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now()
        try {
            const res = await callSandbox(payload)
            const elapsed = Date.now() - started

            if (!res.ok) {
                last_failure = `Sandbox responded with ${res.status}`
                console.log("sandbox validate failed:", sandboxHost(), "status", res.status, "ms", elapsed, "attempt", attempt)
                if (attempt === 1 && RETRY_STATUSES.has(res.status) && elapsed < FAST_FAILURE_MS) {
                    await sleep(RETRY_DELAY_MS)
                    continue
                }
                break
            }

            const data = await res.json()
            const problems = Array.isArray(data?.problems) ? data.problems : []
            console.log("sandbox validate ok:", sandboxHost(), "ms", elapsed, "problems", problems.length)
            if (problems.length > MAX_PROBLEMS) {
                console.log("sandbox problems capped from", problems.length, "to", MAX_PROBLEMS)
            }
            return problems.slice(0, MAX_PROBLEMS)
        } catch (e) {
            const elapsed = Date.now() - started
            const timed_out = e?.name === "AbortError"
            last_failure = timed_out ? "Sandbox timed out" : e?.message || "Sandbox unreachable"
            console.log("sandbox validate error:", sandboxHost(), last_failure, "ms", elapsed, "attempt", attempt)
            if (attempt === 1 && !timed_out && elapsed < FAST_FAILURE_MS) {
                await sleep(RETRY_DELAY_MS)
                continue
            }
            break
        }
    }

    return [{ source: "sandbox", message: last_failure }]
}

export async function VaildateFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return []

    const syntax_problems = checkSyntax(files)
    if (syntax_problems.length > 0) return syntax_problems

    return await checkTypes(files)
}