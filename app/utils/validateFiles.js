import { parse } from "@babel/parser"

const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs)$/
const MOBILE_PREFIX = "mobile/"
const MAX_PROBLEMS = 30
const USE_BUNDLE = process.env.VALIDATE_BUNDLE === "1"
const SANDBOX_TIMEOUT_MS = USE_BUNDLE ? 75000 : 30000

const pluginsFor = (path) => {
    if (/\.tsx$/.test(path)) return ["jsx", "typescript"]
    if (/\.ts$/.test(path)) return ["typescript"]
    return ["jsx"]
}

const checkSyntax = (files) => {
    const problems = []
    for (const file of files) {
        if (!CODE_FILE.test(file.path)) continue
        try {
            parse(file.content, {
                sourceType: "unambiguous",
                plugins: pluginsFor(file.path),
            })
        } catch (e) {
            problems.push({
                path: file.path,
                line: e.loc?.line ?? null,
                column: e.loc?.column ?? null,
                message: e.message,
                source: "syntax",
            })
        }
    }
    return problems
}

const checkInSandbox = async (files) => {
    if (!process.env.SANDBOX_URL) return []

    const payload = {}
    for (const file of files) {
        if (!file.path.startsWith(MOBILE_PREFIX)) continue
        payload[file.path.slice(MOBILE_PREFIX.length)] = file.content
    }
    if (Object.keys(payload).length === 0) return []

    try {
        const res = await fetch(`${process.env.SANDBOX_URL}/check`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.SANDBOX_TOKEN}`,
            },
            body: JSON.stringify({ files: payload, bundle: USE_BUNDLE }),
            signal: AbortSignal.timeout(SANDBOX_TIMEOUT_MS),
        })

        if (!res.ok) {
            console.log("sandbox check failed with status", res.status)
            return []
        }

        const data = await res.json()
        if (data.ok) return []

        const problems = Array.isArray(data.problems) ? data.problems : []
        return problems.map((p) => ({
            path: p.path ? `${MOBILE_PREFIX}${String(p.path).replace(/^\.\//, "")}` : "",
            line: p.line ?? null,
            column: p.column ?? null,
            message: String(p.message || "Unknown problem"),
            source: p.source || "sandbox",
        }))
    } catch (e) {
        console.log("sandbox check skipped:", e?.message)
        return []
    }
}

const dedupe = (problems) => {
    const seen = new Set()
    const out = []
    for (const p of problems) {
        const key = `${p.path}:${p.line}:${p.message}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(p)
    }
    return out
}

export async function VaildateFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return []

    const [syntaxProblems, sandboxProblems] = await Promise.all([
        Promise.resolve(checkSyntax(files)),
        checkInSandbox(files),
    ])

    const brokenPaths = new Set(syntaxProblems.map((p) => p.path))
    const others = sandboxProblems.filter((p) => !brokenPaths.has(p.path))

    return dedupe([...syntaxProblems, ...others]).slice(0, MAX_PROBLEMS)
}