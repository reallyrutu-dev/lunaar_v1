import { parse } from "@babel/parser"

const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs)$/
const LOCATION_SUFFIX = /\s*\(\d+:\d+\)$/
const SANDBOX_URL = process.env.SANDBOX_URL
const SANDBOX_SECRET = process.env.SANDBOX_SECRET
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 55000

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

const checkTypes = async (files) => {
    if (!SANDBOX_URL || !SANDBOX_SECRET) {
        return [{ source: "sandbox", message: "Sandbox is not configured" }]
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SANDBOX_TIMEOUT_MS)

    try {
        const res = await fetch(`${SANDBOX_URL.replace(/\/+$/, "")}/validate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-sandbox-secret": SANDBOX_SECRET,
            },
            body: JSON.stringify({
                files: files
                    .filter((f) => f.path.startsWith("mobile/") && typeof f.content === "string")
                    .map((f) => ({ path: f.path, content: f.content })),
            }),
            signal: controller.signal,
        })

        if (!res.ok) {
            return [{ source: "sandbox", message: `Sandbox responded with ${res.status}` }]
        }

        const data = await res.json()
        return Array.isArray(data?.problems) ? data.problems : []
    } catch (e) {
        return [
            {
                source: "sandbox",
                message: e?.name === "AbortError" ? "Sandbox timed out" : e?.message || "Sandbox unreachable",
            },
        ]
    } finally {
        clearTimeout(timer)
    }
}

export async function VaildateFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return []

    const syntax_problems = checkSyntax(files)
    if (syntax_problems.length > 0) return syntax_problems

    return await checkTypes(files)
}