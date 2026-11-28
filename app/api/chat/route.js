import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import supabase from "../../utils/supabase"
import { createRepo, pushFiles } from "../github/tools"
import { System_prompt } from "./SystemPrompt"
import { buildSystemPrompt, validateDesignAndTheme } from "./designs"
import { SDK, EXPO_VERSIONS, JS_VERSIONS, pinPackageJson } from "./sdkVersions"
import { getSchema, runMigration, queryRows, listProjects } from "../supabase/tools"
import { VaildateFiles } from "../../utils/validateFiles"
import { fixFiles } from "../../utils/fixFiles"
import crypto from "crypto"

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
)

const ALGORITHM = "aes-256-cbc"
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.MASTER_SECRET || "fallback-dev-secret-do-not-use-in-prod",
    "salt",
    32
)

export function decryptApiKey(encryptedString) {
    const [ivHex, encryptedDataHex] = encryptedString.split(":")
    const iv = Buffer.from(ivHex, "hex")
    const encryptedText = Buffer.from(encryptedDataHex, "hex")
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    let decrypted = decipher.update(encryptedText, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
}

export const maxDuration = 300

const IMAGE_BUCKET = "Images"
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])

const MIN_TOKENS_TO_BUILD = Number(process.env.MIN_TOKENS_TO_BUILD) || 5000

const GATEWAY_URL =
    process.env.AI_GATEWAY_URL || "https://ai-gateway.vercel.sh/v1/chat/completions"
const MAX_OUTPUT_TOKENS = Number(process.env.AI_GATEWAY_MAX_TOKENS) || 32768
const AZURE_MAX_OUTPUT_TOKENS = Number(process.env.AZURE_MAX_OUTPUT_TOKENS) || MAX_OUTPUT_TOKENS
const FIRST_TOKEN_TIMEOUT_MS = Number(process.env.AI_FIRST_TOKEN_TIMEOUT_MS) || 45000
const AZURE_FIRST_TOKEN_TIMEOUT_MS = Number(process.env.AZURE_FIRST_TOKEN_TIMEOUT_MS) || 120000
const AZURE_REASONING_EFFORT = String(process.env.AZURE_REASONING_EFFORT || "low").toLowerCase()

const MAX_REPAIRS = process.env.AI_MAX_REPAIRS ? Number(process.env.AI_MAX_REPAIRS) : 2
const CHECK_BUDGET_MS = Number(process.env.AI_CHECK_BUDGET_MS) || 60000
const REPAIR_BUDGET_MS = Number(process.env.AI_REPAIR_BUDGET_MS) || 60000
const REQUEST_LIMIT_MS = Number(process.env.AI_REQUEST_LIMIT_MS) || 285000

const MOBILE_PACKAGE_PATH = "mobile/package.json"
const MOBILE_APP_CONFIG_PATH = "mobile/app.json"

const EFFORTS = new Set(["off", "low", "medium", "high"])
const readEffort = (value, fallback) => {
    const level = String(value || fallback).toLowerCase()
    return EFFORTS.has(level) ? level : fallback
}
const EDIT_EFFORT = readEffort(process.env.AI_GATEWAY_REASONING, "off")
const BUILD_EFFORT = readEffort(process.env.AI_GATEWAY_REASONING_FIRST_BUILD, "low")

const splitList = (value, fallback) =>
    (value || fallback)
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

const PRIMARY_PROVIDERS = parseProviders(process.env.AI_GATEWAY_PROVIDERS)

const TEXT_MODELS = splitList(process.env.AI_GATEWAY_MODELS, "deepseek/deepseek-v4-flash")
const VISION_MODELS = splitList(process.env.AI_GATEWAY_VISION_MODELS, "deepseek/deepseek-v4.1-flash-1017")

const TEXT_PROVIDERS = [
    ...PRIMARY_PROVIDERS,
    ...TEXT_MODELS.map((m) => ({ url: GATEWAY_URL, model: m, keyEnv: null })),
]
const VISION_PROVIDERS = [
    ...PRIMARY_PROVIDERS,
    ...VISION_MODELS.map((m) => ({ url: GATEWAY_URL, model: m, keyEnv: null })),
]

const GITHUB_TOOLS = [
    {
        name: "create_repo",
        description: "Creates a new GitHub repository for the user. Returns the full repo name, url and default branch.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Repository name in kebab-case" },
                description: { type: "string", description: "Short repository description" },
                isPrivate: { type: "boolean", description: "Private repository. Defaults to true" },
            },
            required: ["name"],
        },
    },
    {
        name: "push_project",
        description: "Pushes the latest generated project files, including the mobile and backend folders, in this conversation to a GitHub repository as one commit.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository as owner/name, or just name for the user's own repo" },
                message: { type: "string", description: "Commit message" },
                branch: { type: "string", description: "Branch name. Defaults to the repository default branch" },
            },
            required: ["repo", "message"],
        },
    },
]

const SUPABASE_LIST_TOOL = {
    name: "list_projects",
    description: "List the Supabase projects in the user's connected account (name, ref, region, status). Read-only. You cannot select a project, the user picks it in the app.",
    parameters: { type: "object", properties: {}, required: [] },
}

const SUPABASE_TOOLS = [
    {
        name: "get_schema",
        description: "Get all tables, columns and RLS status in the connected Supabase project's public schema. Call this before writing any SQL.",
        parameters: { type: "object", properties: {}, required: [] },
    },
    {
        name: "run_sql",
        description: "Propose a SQL migration (create tables, add columns, RLS policies) for the connected Supabase project. Every new table must enable row level security and include policies. The migration is not executed until the user approves it.",
        parameters: {
            type: "object",
            properties: {
                sql: { type: "string", description: "The full SQL migration" },
            },
            required: ["sql"],
        },
    },
    {
        name: "query_rows",
        description: "Run a read-only select query on the connected Supabase project and return up to 100 rows.",
        parameters: {
            type: "object",
            properties: {
                sql: { type: "string", description: "A single select statement" },
            },
            required: ["sql"],
        },
    },
]

const TOOLS = [...GITHUB_TOOLS, SUPABASE_LIST_TOOL, ...SUPABASE_TOOLS]
const SUPABASE_TOOL_NAMES = new Set([SUPABASE_LIST_TOOL, ...SUPABASE_TOOLS].map((t) => t.name))
const KNOWN_TOOLS = new Set(TOOLS.map((t) => t.name))
const STRAY_REPLY_TOOLS = /^(json|json_object|output|response|reply|answer|final_answer)$/i
const GITHUB_INTENT = /\b(github|git hub|repo|repository|push|commit)\b/i
const SUPABASE_INTENT = /\bsupabase\b/i
const SUPABASE_TOOLS_INTENT = /\b(supabase|database|tables?|sql|schema|migrations?|rls|row level security)\b/i
const SUPABASE_PROJECTS_INTENT = /\bsupabase\b[\s\S]*\bprojects?\b|\bprojects?\b[\s\S]*\bsupabase\b/i
const TOOL_REJECTED = /tool call validation failed|not in request\.tools|tool_use_failed|support tool use/i

const GITHUB_TOOL_HINT = [
    "The user message is about GitHub.",
    "You have real tools available: create_repo and push_project.",
    "Do NOT describe, simulate, or write JSON about calling them — you MUST actually invoke the tool.",
    "If the user asks to create a repo, call create_repo. If they ask to push or commit, call push_project.",
    "After the tool result comes back, reply with your normal JSON.",
].join(" ")

const SUPABASE_TOOL_HINT = [
    "The user has connected a Supabase account.",
    "You have real tools: list_projects, get_schema, run_sql and query_rows.",
    "If the user asks about their Supabase projects, call list_projects and tell them to pick one in the project selector. You cannot select a project yourself.",
    "get_schema, run_sql and query_rows only work once the user has selected a project.",
    "Call get_schema before writing any SQL.",
    "run_sql only proposes a migration and returns needs_approval. Do not call it again for the same migration.",
    "After it returns, tell the user in your message that the migration is waiting for their approval.",
    "Never put database passwords or service keys in generated code. The app uses only the public URL and anon key.",
    "If the user also asked you to build or change app code, still return the full JSON with the files after the tool results come back.",
    "After the tool result comes back, reply with your normal JSON.",
].join(" ")

const SUPABASE_CONNECT_HINT = [
    "The user has not connected a Supabase account yet, so you have no Supabase tools.",
    "If they ask about Supabase projects or a database, tell them to click the Connect Supabase button in the app first.",
    "Do not tell them to check the Supabase dashboard instead.",
].join(" ")

const IMPORT_RULES_HINT =
    'Icons come from "@expo/vector-icons" (for example import { Ionicons } from "@expo/vector-icons"). Never write "expo/vector-icons" without the @. Only import packages that are listed in package.json or bundled with Expo. Every relative import must point to a file that exists in the project and must use a name that file really exports. Every JSX component must be imported or defined in its own file.'

const ALLOWED_PACKAGE_NAMES = [...Object.keys(EXPO_VERSIONS), ...Object.keys(JS_VERSIONS)]

const SDK_HINT = `This project uses Expo SDK ${SDK}. Write "*" as the version of every dependency in mobile/package.json, the server fills in the real versions. Only import these packages: ${ALLOWED_PACKAGE_NAMES.join(", ")}, and @expo-google-fonts packages. Any other package is rejected. Only use APIs that exist in Expo SDK ${SDK}.`

const JSON_ONLY_HINT =
    'Your entire reply must be one JSON object and nothing else. No thinking, no explanation, no text before or after it, no markdown fences. When you write or change code, put every file in the "files" array as {"path": "...", "content": "..."}.'

const FALLBACK_STATUSES = new Set([402, 404, 408, 429, 500, 502, 503, 504])

const PROJECT_FOLDERS = new Set(["mobile", "backend"])
const ROOT_FILES = new Set(["render.yaml", "README.md", ".gitignore"])

const IMPORT_FIXES = [
    [/(["'])expo\/vector-icons(\/[^"']*)?\1/g, '"@expo/vector-icons$2"'],
    [/(["'])expo-vector-icons(\/[^"']*)?\1/g, '"@expo/vector-icons$2"'],
    [/(["'])@expo\/vector-icon(\/[^"']*)?\1/g, '"@expo/vector-icons$2"'],
    [/(["'])react-native-vector-icons(\/[^"']*)?\1/g, '"@expo/vector-icons$2"'],
]

const fixImports = (content) => {
    let out = content
    for (const [pattern, replacement] of IMPORT_FIXES) out = out.replace(pattern, replacement)
    return out
}

const stripSdkVersion = (content) => {
    try {
        const config = JSON.parse(content)
        if (config?.expo && "sdkVersion" in config.expo) {
            delete config.expo.sdkVersion
            return JSON.stringify(config, null, 2)
        }
        return content
    } catch {
        return content
    }
}

const fixConfigFile = (path, content) => (path === MOBILE_APP_CONFIG_PATH ? stripSdkVersion(content) : content)

const pinPackageFiles = async (files) =>
    files.map((file) =>
        file.path === MOBILE_PACKAGE_PATH ? { ...file, content: pinPackageJson(file.content) } : file
    )

const IMPORT_PATTERNS = [
    /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
]
const SKIP_PREFIXES = [".", "/", "@/", "~/"]

const packageNameOf = (spec) => {
    const parts = spec.split("/")
    return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const missingPackageProblems = (merged) => {
    const pkgFile = merged.get(MOBILE_PACKAGE_PATH)
    if (!pkgFile) return []

    let declared = new Set()
    try {
        declared = new Set(Object.keys(JSON.parse(pkgFile.content).dependencies || {}))
    } catch {
        return []
    }

    const problems = []
    for (const [path, file] of merged) {
        if (!path.startsWith("mobile/") || !/\.(js|jsx|ts|tsx)$/i.test(path)) continue
        const reported = new Set()
        for (const pattern of IMPORT_PATTERNS) {
            pattern.lastIndex = 0
            let m
            while ((m = pattern.exec(file.content)) !== null) {
                const spec = m[1]
                if (SKIP_PREFIXES.some((p) => spec.startsWith(p))) continue
                const name = packageNameOf(spec)
                if (declared.has(name) || reported.has(name)) continue
                reported.add(name)
                problems.push(
                    `${path}: package "${name}" is not in the allowed package list for Expo SDK ${SDK}. Remove the import and write the logic yourself or use an allowed package.`
                )
            }
        }
    }
    return problems
}

const CODE_FILE = /\.(js|jsx|ts|tsx)$/i
const JSX_FILE = /\.(js|jsx|tsx)$/i
const RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".json"]
const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ttf|otf|mp3|mp4|wav|json)$/i
const LOCAL_IMPORT = /import\s+(?!type\b)([^;'"]*?)\s+from\s+["'](\.{1,2}(?:\/[^"']*)?)["']/g
const JSX_TAG = /(?<![\w$.])<([A-Z][\w$]+)(?=[\s>/.])/g

const REQUIRED_UI_EXPORTS = [
    "Screen",
    "AppText",
    "Button",
    "IconButton",
    "Card",
    "Input",
    "Badge",
    "Chip",
    "StatTile",
    "SectionHeader",
    "ListRow",
    "EmptyState",
    "FadeIn",
]
const REQUIRED_THEME_EXPORTS = ["palettes", "spacing", "radius", "fonts", "look", "useTheme"]

const resolveLocal = (fromPath, spec, merged) => {
    const parts = fromPath.split("/").slice(0, -1)
    for (const part of spec.split("/")) {
        if (part === "." || part === "") continue
        if (part === "..") parts.pop()
        else parts.push(part)
    }
    const base = parts.join("/")
    for (const ext of RESOLVE_EXTENSIONS) {
        if (merged.has(base + ext)) return base + ext
    }
    for (const ext of RESOLVE_EXTENSIONS.slice(1)) {
        if (merged.has(`${base}/index${ext}`)) return `${base}/index${ext}`
    }
    return null
}

const collectExports = (content) => {
    const names = new Set()
    let hasDefault = false
    let wildcard = false

    const declarations =
        /export\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g
    for (const m of content.matchAll(declarations)) names.add(m[1])

    for (const m of content.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const cleaned = part.trim().replace(/^type\s+/, "")
            if (!cleaned) continue
            const pieces = cleaned.split(/\s+as\s+/)
            const exported = (pieces[1] || pieces[0]).trim()
            if (exported === "default") hasDefault = true
            else names.add(exported)
        }
    }

    if (/export\s+default\b/.test(content)) hasDefault = true
    if (/export\s*\*\s*(?:as\s+[\w$]+\s*)?from/.test(content)) wildcard = true

    return { names, hasDefault, wildcard }
}

const parseImportClause = (clause) => {
    const result = { def: null, named: [] }
    let rest = clause.trim()

    const braceStart = rest.indexOf("{")
    if (braceStart !== -1) {
        const braceEnd = rest.indexOf("}", braceStart)
        const inner = rest.slice(braceStart + 1, braceEnd === -1 ? undefined : braceEnd)
        for (const part of inner.split(",")) {
            const cleaned = part.trim()
            if (!cleaned || /^type\s+/.test(cleaned)) continue
            result.named.push(cleaned.split(/\s+as\s+/)[0].trim())
        }
        rest = rest.slice(0, braceStart)
    }

    if (rest.includes("*")) return result

    const def = rest.replace(/,/g, "").trim()
    if (def) result.def = def
    return result
}

const missingLocalProblems = (merged) => {
    const problems = []
    const cache = new Map()
    const exportsOf = (path) => {
        if (!cache.has(path)) cache.set(path, collectExports(merged.get(path).content))
        return cache.get(path)
    }

    for (const [path, file] of merged) {
        if (!path.startsWith("mobile/") || !CODE_FILE.test(path)) continue
        const reported = new Set()
        const report = (message) => {
            if (reported.has(message)) return
            reported.add(message)
            problems.push(message)
        }

        for (const m of file.content.matchAll(LOCAL_IMPORT)) {
            const clause = m[1]
            const spec = m[2]
            const target = resolveLocal(path, spec, merged)

            if (!target) {
                if (ASSET_EXTENSION.test(spec)) continue
                report(`${path}: imports "${spec}" but that file does not exist in the project. Create it or fix the import path.`)
                continue
            }
            if (!CODE_FILE.test(target)) continue

            const info = exportsOf(target)
            const parsed = parseImportClause(clause)

            if (parsed.def && !info.hasDefault && !info.wildcard) {
                report(`${path}: imports a default export from "${spec}" but ${target} has no default export. Use a named import or add the default export.`)
            }
            if (!info.wildcard) {
                for (const name of parsed.named) {
                    if (!info.names.has(name)) {
                        report(`${path}: imports "${name}" from "${spec}" but ${target} does not export it. Export it there or import an existing name.`)
                    }
                }
            }
        }
    }
    return problems
}

const requiredExportProblems = (merged) => {
    const problems = []
    const check = (candidates, required) => {
        const path = candidates.find((p) => merged.has(p))
        if (!path) return
        const info = collectExports(merged.get(path).content)
        if (info.wildcard) return
        const missing = required.filter((name) => !info.names.has(name))
        if (missing.length > 0) {
            problems.push(`${path}: missing required export${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Add ${missing.length === 1 ? "it" : "them"} exactly as named.`)
        }
    }
    check(["mobile/components/ui.tsx", "mobile/components/ui.jsx"], REQUIRED_UI_EXPORTS)
    check(["mobile/constants/theme.ts", "mobile/constants/theme.js"], REQUIRED_THEME_EXPORTS)
    return problems
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const undefinedComponentProblems = (merged) => {
    const problems = []
    for (const [path, file] of merged) {
        if (!path.startsWith("mobile/") || !JSX_FILE.test(path)) continue
        const names = new Set()
        for (const m of file.content.matchAll(JSX_TAG)) names.add(m[1])
        for (const name of names) {
            const bound = new RegExp(`(?<![<\\/\\w$.])${escapeRegExp(name)}(?![\\w$])`)
            if (!bound.test(file.content)) {
                problems.push(`${path}: <${name}> is used in JSX but is never imported or defined in this file. Import it from the correct file or define it.`)
            }
        }
    }
    return problems
}

const normalizePath = (value) => {
    const parts = String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part && part !== ".")
    if (parts.length === 0 || parts.includes("..")) return ""
    const [first] = parts
    if (PROJECT_FOLDERS.has(first) && parts.length > 1) return parts.join("/")
    if (parts.length === 1 && ROOT_FILES.has(first)) return first
    return ["mobile", ...parts].join("/")
}

const CONTENT_KEYS = ["content", "contents", "code", "text", "source"]
const PATH_KEYS = ["path", "file", "filename", "filepath", "name"]

const pickString = (obj, keys) => {
    for (const key of keys) {
        if (typeof obj?.[key] === "string") return obj[key]
    }
    return null
}

const toFileList = (files) => {
    if (Array.isArray(files)) return files
    if (files && typeof files === "object") {
        return Object.entries(files).map(([path, value]) =>
            typeof value === "string"
                ? { path, content: value }
                : { path, content: pickString(value, CONTENT_KEYS) }
        )
    }
    return []
}

const normalizeFiles = (files) => {
    const byPath = new Map()
    for (const file of toFileList(files)) {
        if (!file || typeof file !== "object") continue
        const content = pickString(file, CONTENT_KEYS)
        if (content === null) continue
        const path = normalizePath(pickString(file, PATH_KEYS))
        if (!path) continue
        const is_code = /\.(js|jsx|ts|tsx)$/i.test(path)
        byPath.set(path, { ...file, path, content: is_code ? fixImports(content) : fixConfigFile(path, content) })
    }
    return [...byPath.values()]
}

const projectFiles = (rows) => {
    const byPath = new Map()
    for (const row of rows) {
        if (row.role !== "ai") continue
        try {
            const parsed = JSON.parse(row.message)
            if (!Array.isArray(parsed.files)) continue
            for (const file of normalizeFiles(parsed.files)) byPath.set(file.path, file)
        } catch {}
    }
    return [...byPath.values()]
}

const PATH_IN_TEXT = /\b((?:mobile|backend)\/[\w./@-]+\.(?:js|jsx|ts|tsx|json))/g
const LOCATION_IN_TEXT = /\((\d+):(\d+)\)/

const problemText = (p) => {
    if (typeof p === "string") return p
    const where = String(p?.path ?? p?.file ?? "")
    const line = p?.line ? `:${p.line}` : ""
    return `${where}${line}: ${String(p?.message ?? "Unknown problem")}`
}

const problemPaths = (p) => {
    const direct = typeof p === "string" ? "" : String(p?.path ?? p?.file ?? "")
    if (direct) return [direct]
    return [...problemText(p).matchAll(PATH_IN_TEXT)].map((m) => m[1])
}

const toErrorDetail = (p) => {
    const raw = typeof p === "string" ? p : String(p?.message ?? "Unknown problem")
    const loc = raw.match(LOCATION_IN_TEXT)
    const path = problemPaths(p)[0] || ""

    let message = raw.replace(LOCATION_IN_TEXT, "").trim()
    if (path && message.startsWith(path)) {
        message = message.slice(path.length).replace(/^[:\d\s]+/, "").trim()
    }

    return {
        path,
        line: Number(p?.line) || (loc ? Number(loc[1]) : null),
        column: Number(p?.column ?? p?.col) || (loc ? Number(loc[2]) : null),
        message: message || "Unknown problem",
    }
}

async function runValidation(files_map) {
    try {
        const result = await VaildateFiles([...files_map.values()])
        const list = Array.isArray(result) ? result : []
        const infra = list.filter((p) => p?.source === "sandbox")
        if (infra.length > 0) {
            console.log("sandbox infrastructure problem, skipping:", infra.map((p) => p.message).slice(0, 2))
        }
        return list.filter((p) => p?.source !== "sandbox")
    } catch (e) {
        console.log("validation crashed, skipping:", e?.message)
        return []
    }
}

const claimBuild = async (user_id) => {
    const { data, error } = await supabase.rpc("claim_build", { p_user: user_id })
    if (error || !data) {
        console.log("build limit check failed, allowing request:", error?.message)
        return { ok: true, claimed: false }
    }
    return { ...data, claimed: data.ok === true }
}

const releaseBuild = async (user_id) => {
    const { error } = await supabase.rpc("release_build", { p_user: user_id })
    if (error) console.log("build slot release failed:", error.message)
}

async function saveFiles(user_id, chat_id, files) {
    if (!files.length) return
    const now = new Date().toISOString()
    const rows = files.map((f) => ({
        chat_id,
        user_id,
        path: f.path,
        content: f.content,
        updated_at: now,
    }))

    const { error } = await supabase
        .from("project_files")
        .upsert(rows, { onConflict: "chat_id,path" })
    if (!error) return

    console.log("batch file save failed, saving per file:", error.message)
    await Promise.all(
        rows.map(async (row) => {
            const { error: row_error } = await supabase
                .from("project_files")
                .upsert(row, { onConflict: "chat_id,path" })
            if (row_error) console.log("file save failed:", row.path, row_error.message)
        })
    )
}

async function loadProjectFiles(user_id, chat_id, history) {
    const { data, error } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("user_id", user_id)
        .eq("chat_id", chat_id)
    if (error) throw error
    if (data?.length) return data

    const legacy = projectFiles(history)
    if (legacy.length) await saveFiles(user_id, chat_id, legacy)
    return legacy
}

const compactHistory = (rows) =>
    rows.flatMap((row) => {
        if (row.role !== "ai") return [row]
        try {
            const parsed = JSON.parse(row.message)
            if (parsed?.failed) return []
            return [
                {
                    role: "ai",
                    message: JSON.stringify({
                        ...parsed,
                        files: [],
                        blocks: [],
                        changed_paths: undefined,
                        pending_sql: undefined,
                        problems: undefined,
                        error_details: undefined,
                    }),
                },
            ]
        } catch {
            return [row]
        }
    })

const mergeConsecutiveHuman = (rows) => {
    const out = []
    for (const row of rows) {
        const prev = out[out.length - 1]
        if (prev && prev.role === "human" && row.role === "human") {
            out[out.length - 1] = { ...prev, message: `${prev.message}\n\n${row.message}` }
        } else {
            out.push(row)
        }
    }
    return out
}

const buildModelMessage = (files, user_message, image_count = 0) => {
    const note = image_count
        ? `${image_count} reference image(s) attached. Use them as visual references for layout, colors and style.\n\n`
        : ""
    if (!files.length) return note + user_message
    const listing = files.map((f) => `--- ${f.path}\n${f.content}`).join("\n")
    return `CURRENT PROJECT FILES:\n${listing}\n\n${note}REQUEST:\n${user_message}`
}

const providerError = (message, status, code) => {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
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

const gatewayAdapter = {
    init: ({ system, history, user_message, imgs = [], effort = "off" }) => ({
        effort,
        messages: [
            { role: "system", content: system },
            ...history.map((m) => ({
                role: m.role === "ai" ? "assistant" : "user",
                content: m.message,
            })),
            {
                role: "user",
                content:
                    imgs.length > 0
                        ? [
                              { type: "text", text: user_message },
                              ...imgs.map((img) => ({
                                  type: "image_url",
                                  image_url: { url: `data:${img.mimeType};base64,${img.data}` },
                              })),
                          ]
                        : user_message,
            },
        ],
    }),

    call: async (api_key, provider, state, tools, hooks = {}) => {
        const key = provider.keyEnv ? process.env[provider.keyEnv] : api_key
        if (!key) {
            throw providerError(`No API key configured for provider ${provider.url}`, 401, "missing_key")
        }

        const isAzure = isAzureUrl(provider.url)
        const endpoint = resolveEndpoint(provider.url)
        const firstTokenTimeout = isAzure ? AZURE_FIRST_TOKEN_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS

        const body = {
            model: provider.model,
            messages: state.messages,
            max_completion_tokens: isAzure ? AZURE_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
            stream: true,
            stream_options: { include_usage: true },
        }

        if (isAzure) {
            if (AZURE_REASONING_EFFORT && AZURE_REASONING_EFFORT !== "omit") {
                body.reasoning_effort = AZURE_REASONING_EFFORT
            }
        } else {
            const effort = state.effort || "off"
            if (effort === "off") {
                body.reasoning = { enabled: false }
                body.thinking = { type: "disabled" }
                body.chat_template_kwargs = { enable_thinking: false, thinking: false }
            } else {
                body.reasoning = { effort }
                body.reasoning_effort = effort
                body.thinking = { type: "enabled" }
                body.chat_template_kwargs = { enable_thinking: true, thinking: true }
            }
        }

        if (tools.length > 0) {
            body.tool_choice = "auto"
            body.tools = tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                },
            }))
        }

        const headers = { "Content-Type": "application/json" }
        if (isAzure) headers["api-key"] = key
        else headers.Authorization = `Bearer ${key}`

        const controller = new AbortController()
        let timer = setTimeout(() => controller.abort(), firstTokenTimeout)
        const clearTimer = () => {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
        }

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw providerError(
                    data?.error?.message || data?.message || "AI provider request failed",
                    res.status,
                    data?.error?.code || data?.error?.type
                )
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let text = ""
            let reasoning_chars = 0
            let finish
            let usage
            const tool_calls = []

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })

                const lines = buffer.split("\n")
                buffer = lines.pop()

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith("data:")) continue
                    const payload = trimmed.slice(5).trim()
                    if (!payload || payload === "[DONE]") continue

                    let json
                    try {
                        json = JSON.parse(payload)
                    } catch {
                        continue
                    }

                    if (json.error) {
                        const code = json.error.code
                        throw providerError(
                            json.error.message || "AI provider stream failed",
                            code === "tool_use_failed" ? 400 : Number(code) || json.error.status || 500,
                            code
                        )
                    }

                    if (json.usage) usage = json.usage

                    const choice = json.choices?.[0]
                    if (!choice) continue
                    if (choice.finish_reason) finish = choice.finish_reason

                    const delta = choice.delta || {}

                    const thought = delta.reasoning_content ?? delta.reasoning
                    if (typeof thought === "string" && thought.length > 0) {
                        clearTimer()
                        reasoning_chars += thought.length
                        hooks.onReasoning?.(reasoning_chars)
                    }

                    if (delta.content) {
                        clearTimer()
                        text += delta.content
                        hooks.onText?.(delta.content)
                    }

                    for (const tc of delta.tool_calls || []) {
                        clearTimer()
                        const i = tc.index ?? 0
                        if (!tool_calls[i]) {
                            tool_calls[i] = { id: "", type: "function", function: { name: "", arguments: "" } }
                        }
                        const current = tool_calls[i]
                        if (tc.id) current.id = tc.id
                        if (tc.function?.name && !current.function.name) current.function.name = tc.function.name
                        if (tc.function?.arguments) current.function.arguments += tc.function.arguments
                    }
                }
            }

            const finished_calls = tool_calls.filter(Boolean)
            const calls = finished_calls.map((c) => {
                let args = {}
                try {
                    args = JSON.parse(c.function.arguments || "{}")
                } catch {}
                return { id: c.id, name: c.function.name, args }
            })

            return {
                text: calls.length > 0 ? "" : text,
                calls,
                finish,
                model: provider.model,
                provider: provider.url,
                usage,
                reasoning_chars,
                assistant: {
                    role: "assistant",
                    content: text || null,
                    tool_calls: finished_calls.length > 0 ? finished_calls : undefined,
                },
            }
        } catch (e) {
            if (e?.name === "AbortError") {
                throw providerError(
                    `No response from AI provider within ${Math.round(firstTokenTimeout / 1000)}s`,
                    408,
                    "timeout"
                )
            }
            throw e
        } finally {
            clearTimer()
        }
    },

    append: (state, output, results) => ({
        effort: state.effort,
        messages: [
            ...state.messages,
            output.assistant,
            ...results.map((r) => ({
                role: "tool",
                tool_call_id: r.id,
                content: JSON.stringify(r.result),
            })),
        ],
    }),
}

const slugify = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)

const stripThinking = (text) =>
    String(text ?? "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^[\s\S]*<\/think>/i, "")
        .trim()

const extractJsonObject = (text) => {
    const found = []
    let depth = 0
    let start = -1
    let inStr = false
    let esc = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inStr) {
            if (esc) esc = false
            else if (ch === "\\") esc = true
            else if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') {
            inStr = true
            continue
        }
        if (ch === "{") {
            if (depth === 0) start = i
            depth++
        } else if (ch === "}") {
            depth--
            if (depth === 0 && start >= 0) {
                try {
                    const obj = JSON.parse(text.slice(start, i + 1))
                    if (obj && typeof obj === "object" && ("message" in obj || "files" in obj)) {
                        found.push(obj)
                    }
                } catch {}
                start = -1
            }
        }
    }
    return found.length > 0 ? found[found.length - 1] : null
}

const parseReply = (text) => {
    const clean = stripThinking(text)
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
    try {
        return JSON.parse(clean)
    } catch {}
    const found = extractJsonObject(clean)
    if (found) return found
    throw new Error("No JSON object in reply")
}

const extractStrayReply = (calls) => {
    const stray = calls.find(
        (c) => !KNOWN_TOOLS.has(c.name) && STRAY_REPLY_TOOLS.test(String(c.name || ""))
    )
    if (!stray) return null
    const args = stray.args || {}
    if (typeof args.json === "string") return args.json
    if (typeof args.content === "string") return args.content
    if (Object.keys(args).length === 0) return null
    return JSON.stringify(args)
}

const looksLikeToolCall = (obj, name) =>
    KNOWN_TOOLS.has(name) &&
    !("path" in obj) &&
    !("content" in obj) &&
    !("files" in obj)

const extractTextToolCalls = (text) => {
    if (typeof text !== "string" || !text.includes("{")) return []
    const calls = []
    let depth = 0
    let start = -1
    let inStr = false
    let esc = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inStr) {
            if (esc) esc = false
            else if (ch === "\\") esc = true
            else if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') {
            inStr = true
            continue
        }
        if (ch === "{") {
            if (depth === 0) start = i
            depth++
        } else if (ch === "}") {
            depth--
            if (depth === 0 && start >= 0) {
                try {
                    const obj = JSON.parse(text.slice(start, i + 1))
                    const name = obj.name || obj.tool || obj.function?.name
                    if (typeof name === "string" && looksLikeToolCall(obj, name)) {
                        const args =
                            obj.args || obj.arguments || obj.parameters || obj.inputs || {}
                        calls.push({ id: `text_${calls.length}`, name, args })
                    }
                } catch {}
                start = -1
            }
        }
    }
    return calls
}

const createProgress = (send) => {
    let text = ""
    let scan_from = 0
    let last_sent = 0
    let last_thought = 0
    const seen = new Set()

    return {
        onText(chunk) {
            text += chunk

            const tail = text.slice(scan_from)
            for (const match of tail.matchAll(/"path"\s*:\s*"([^"]+)"/g)) {
                if (!seen.has(match[1])) {
                    seen.add(match[1])
                    send({ type: "file", path: match[1] })
                }
            }
            scan_from = Math.max(0, text.length - 200)

            const now = Date.now()
            if (now - last_sent > 250) {
                last_sent = now
                send({ type: "progress", chars: text.length })
            }
        },
        onReasoning(chars) {
            const now = Date.now()
            if (now - last_thought > 1000) {
                last_thought = now
                send({ type: "thinking", chars })
            }
        },
        reset() {
            text = ""
            scan_from = 0
            seen.clear()
            send({ type: "reset" })
        },
    }
}

async function generateWithFallback(adapter, api_key, providers, state, tools, hooks = {}) {
    let last_error
    for (const provider of providers) {
        try {
            return await adapter.call(api_key, provider, state, tools, hooks)
        } catch (e) {
            last_error = e
            let status = e?.status ?? e?.code

            if (
                (status === 400 || status === 404) &&
                tools.length > 0 &&
                (e?.code === "tool_use_failed" || TOOL_REJECTED.test(e?.message || ""))
            ) {
                console.log(`${provider.model} rejected tools, retrying without tools`)
                hooks.onSwitch?.()
                try {
                    return await adapter.call(api_key, provider, state, [], hooks)
                } catch (retry_error) {
                    last_error = retry_error
                    status = retry_error?.status ?? retry_error?.code
                    e = retry_error
                }
            }

            if (!FALLBACK_STATUSES.has(status)) throw e
            console.log(`provider ${provider.url} model ${provider.model} unavailable (${status}): ${e?.message}. Trying next`)
            hooks.onSwitch?.()
        }
    }
    throw last_error || providerError("No AI provider available", 404)
}

const sseHeaders = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
}

async function loadImages(user_id, chat_id, urls) {
    if (!Array.isArray(urls) || urls.length === 0) return []
    if (urls.length > MAX_IMAGES) throw new Error("Max 4 images per message")

    const folder = `${user_id}/${chat_id}/`
    const prefix = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(folder).data.publicUrl

    return Promise.all(
        urls.map(async (url) => {
            if (typeof url !== "string" || !url.startsWith(prefix)) throw new Error("Invalid image url")

            const name = decodeURIComponent(url.slice(prefix.length).split("?")[0])
            if (!name || name.includes("/") || name.includes("..")) throw new Error("Invalid image url")

            const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(folder + name)
            if (error || !data) throw new Error("Could not load an image")
            if (data.size > MAX_IMAGE_BYTES) throw new Error("Image is too large (4MB max)")

            const mimeType = ALLOWED_IMAGE_TYPES.has(data.type) ? data.type : "image/jpeg"
            const buffer = Buffer.from(await data.arrayBuffer())
            return { url, mimeType, data: buffer.toString("base64") }
        })
    )
}

export async function POST(request) {
    try {
        const token = request.headers.get("authorization")?.replace("Bearer ", "")
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { data: auth, error: auth_err } = await supabase.auth.getUser(token)
        if (auth_err || !auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const user_id = auth.user.id

        const { data: profile, error: profile_err } = await supabase
            .from("profiles")
            .select("remaining_tokens")
            .eq("id", user_id)
            .maybeSingle()

        if (profile_err) console.log("token balance lookup failed:", profile_err.message)
        if (profile && Number(profile.remaining_tokens) < MIN_TOKENS_TO_BUILD) {
            return NextResponse.json({ response: "Tokens too low",type:"done" }, { status: 402 })
        }

        const body = await request.json()
        const { user_message, chat_id: incoming_chat_id } = body

        if (!user_message || user_message.trim().length === 0) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 })
        }

        const api_key = process.env.AI_GATEWAY_API_KEY
        if (!api_key) {
            console.log("AI_GATEWAY_API_KEY is not set")
            return NextResponse.json({ error: "The AI service is not configured" }, { status: 500 })
        }

        const chat_id = incoming_chat_id || crypto.randomUUID()

        let imgs = []
        try {
            imgs = await loadImages(user_id, chat_id, body.images)
        } catch (e) {
            return NextResponse.json({ error: e.message }, { status: 400 })
        }

        const providers = imgs.length > 0 ? VISION_PROVIDERS : TEXT_PROVIDERS
        if (providers.length === 0) {
            return NextResponse.json({ error: "No model is configured for this request" }, { status: 500 })
        }

        const { data: history_rows, error: history_err } = await supabase
            .from("conversations")
            .select("role, message")
            .eq("user_id", user_id)
            .eq("chat_id", chat_id)
            .order("created_at", { ascending: true })
        if (history_err) throw history_err
        const history = history_rows || []

        const adapter = gatewayAdapter

        const claim = await claimBuild(user_id)
        if (!claim.ok) {
            const message =
                claim.reason === "running"
                    ? "You already have a build running. Wait for it to finish."
                    : `You're building too fast. Try again in ${claim.retry_after}s.`
            return NextResponse.json(
                { error: message },
                { status: 429, headers: { "Retry-After": String(claim.retry_after) } }
            )
        }

        const is_first_message = history.length === 0

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            async start(controller) {
                const started_at = Date.now()
                const mark = (label) =>
                    console.log("timing:", label, "at", Math.round((Date.now() - started_at) / 1000) + "s")
                let closed = false
                const send = (event) => {
                    if (closed) return
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                    } catch {
                        closed = true
                    }
                }

                try {
                    const human_saved = Promise.all([
                        supabase.from("conversations").insert({
                            user_id,
                            chat_id,
                            role: "human",
                            message: user_message,
                            images: imgs.map((img) => img.url),
                            created_at: new Date().toISOString(),
                        }),
                        is_first_message
                            ? supabase.from("chats").upsert({
                                  id: chat_id,
                                  user_id,
                                  title: user_message.slice(0, 40),
                              })
                            : Promise.resolve({ error: null }),
                    ])

                    const saveFailure = async (text) => {
                        try {
                            await human_saved
                            const { error: failure_err } = await supabase.from("conversations").insert({
                                user_id,
                                chat_id,
                                role: "ai",
                                message: JSON.stringify({
                                    type: "chat",
                                    title: "",
                                    message: text,
                                    design: null,
                                    folder_name: "",
                                    language: "tsx",
                                    sql: "",
                                    files: [],
                                    blocks: [],
                                    failed: true,
                                }),
                                created_at: new Date().toISOString(),
                            })
                            if (failure_err) console.log("failure row save failed:", failure_err.message)
                        } catch (e) {
                            console.log("failure row save crashed:", e?.message)
                        }
                    }

                    send({ type: "status", text: "Reading your project" })

                    const loaded_files = await loadProjectFiles(user_id, chat_id, history)
                    const project_files = await pinPackageFiles(
                        loaded_files.map((f) => ({ ...f, content: fixConfigFile(f.path, f.content) }))
                    )
                    const repaired_files = project_files.filter((f, i) => f.content !== loaded_files[i].content)
                    if (repaired_files.length > 0) await saveFiles(user_id, chat_id, repaired_files)
                    mark("project loaded")

                    const { data: sb_conn, error: sb_err } = await admin
                        .from("supabase_connections")
                        .select("user_id, project_ref")
                        .eq("user_id", user_id)
                        .maybeSingle()

                    if (sb_err) console.log("supabase_connections lookup failed:", sb_err.message)

                    const wants_supabase = SUPABASE_TOOLS_INTENT.test(user_message)

                    const active_tools = [
                        ...(GITHUB_INTENT.test(user_message) ? GITHUB_TOOLS : []),
                        ...(sb_conn && wants_supabase ? [SUPABASE_LIST_TOOL] : []),
                        ...(sb_conn?.project_ref && wants_supabase ? SUPABASE_TOOLS : []),
                    ]

                    console.log("active tools:", active_tools.map((t) => t.name), "connected:", !!sb_conn)

                    let injected_projects = ""
                    if (sb_conn && SUPABASE_PROJECTS_INTENT.test(user_message)) {
                        try {
                            const projects = await listProjects(user_id)
                            injected_projects = `\n\nSUPABASE PROJECTS IN THE USER'S CONNECTED ACCOUNT (fetched by the server):\n${JSON.stringify(projects)}\nList these for the user and tell them to pick one in the project selector.`
                        } catch (e) {
                            injected_projects = `\n\nThe server could not list the user's Supabase projects: ${e?.message}. Tell the user this error.`
                        }
                    }

                    let pending_sql = ""

                    const executeTool = async (name, args) => {
                        if (name === "create_repo") {
                            const res = await createRepo(user_id, args)
                            if (res && !res.error) {
                                const { error: chat_err } = await supabase.from("chats").upsert({
                                    id: chat_id,
                                    user_id,
                                    repo_url: res.url,
                                    repo_full_name: res.fullName ?? res.full_name ?? res.name,
                                })
                                if (chat_err) console.log("chats repo update failed:", chat_err.message)
                            }
                            return res
                        }
                        if (name === "push_project") {
                            if (!project_files.length) throw new Error("There are no project files to push yet")
                            return await pushFiles(user_id, { ...args, files: project_files })
                        }
                        if (name === "list_projects") {
                            return await listProjects(user_id)
                        }
                        if (name === "get_schema") {
                            return await getSchema(user_id)
                        }
                        if (name === "run_sql") {
                            const result = await runMigration(user_id, String(args.sql || ""), false)
                            if (result.status === "needs_approval") pending_sql = result.sql
                            return result
                        }
                        if (name === "query_rows") {
                            return await queryRows(user_id, String(args.sql || ""))
                        }
                        throw new Error(`Unknown tool ${name}`)
                    }

                    let model_history = mergeConsecutiveHuman(compactHistory(history))
                    let request_text = user_message
                    const last_row = model_history[model_history.length - 1]
                    if (last_row?.role === "human") {
                        request_text = `${last_row.message}\n\n${user_message}`
                        model_history = model_history.slice(0, -1)
                    }

                    const progress = createProgress(send)
                    const hooks = {
                        onText: progress.onText,
                        onReasoning: progress.onReasoning,
                        onSwitch: progress.reset,
                    }

                    let output
                    let state
                    let used_tools = false

                    try {
                        const is_build = project_files.length === 0
                        const base_prompt = is_build ? buildSystemPrompt() : System_prompt

                        const hints = [
                            active_tools.some((t) => !SUPABASE_TOOL_NAMES.has(t.name)) ? GITHUB_TOOL_HINT : "",
                            active_tools.some((t) => SUPABASE_TOOL_NAMES.has(t.name)) ? SUPABASE_TOOL_HINT : "",
                            !sb_conn && SUPABASE_INTENT.test(user_message) ? SUPABASE_CONNECT_HINT : "",
                        ].filter(Boolean)
                        const system = [base_prompt, ...hints, SDK_HINT, IMPORT_RULES_HINT, JSON_ONLY_HINT].join("\n\n")

                        state = adapter.init({
                            system,
                            history: model_history,
                            user_message: buildModelMessage(project_files, request_text + injected_projects, imgs.length),
                            imgs,
                            effort: active_tools.length > 0 ? "off" : is_build ? BUILD_EFFORT : EDIT_EFFORT,
                        })

                        send({ type: "status", text: "Generating" })

                        for (let round = 0; round < 5; round++) {
                            const started = Date.now()
                            output = await generateWithFallback(adapter, api_key, providers, state, active_tools, hooks)
                            if (
                                !output.text &&
                                output.calls.length === 0 &&
                                output.finish === "length" &&
                                state.effort !== "off"
                            ) {
                                console.log("reasoning used the whole budget, retrying without reasoning")
                                progress.reset()
                                state = { ...state, effort: "off" }
                                output = await generateWithFallback(adapter, api_key, providers, state, active_tools, hooks)
                            }
                            console.log(
                                "usage:",
                                output.provider,
                                output.model,
                                JSON.stringify(output.usage || {}),
                                "reasoning_chars:",
                                output.reasoning_chars,
                                "seconds:",
                                Math.round((Date.now() - started) / 1000)
                            )

                            if (output.calls.length === 0 && active_tools.length > 0) {
                                const text_calls = extractTextToolCalls(output.text)
                                if (text_calls.length > 0) {
                                    console.log("model wrote tool calls as text, executing them")
                                    output = { ...output, calls: text_calls, text: "" }
                                }
                            }

                            if (output.calls.length === 0) break

                            const stray_reply = extractStrayReply(output.calls)
                            if (stray_reply) {
                                console.log("model called a reply tool, using its arguments as the reply")
                                output = { ...output, text: stray_reply, calls: [] }
                                break
                            }

                            used_tools = true
                            send({
                                type: "status",
                                text: output.calls.some((c) => SUPABASE_TOOL_NAMES.has(c.name))
                                    ? "Talking to Supabase"
                                    : "Talking to GitHub",
                            })
                            const results = []
                            for (const call of output.calls) {
                                let result
                                try {
                                    result = await executeTool(call.name, call.args)
                                } catch (e) {
                                    result = { error: e?.message || "Tool failed" }
                                }
                                console.log(call.name, result)
                                results.push({ id: call.id, name: call.name, result })
                            }

                            progress.reset()
                            state = adapter.append(state, output, results)
                        }
                    } catch (e) {
                        console.log("generation error:", e?.status ?? e?.code, e?.message)
                        const status = e?.status ?? e?.code
                        let failure_status = 500
                        let failure_text = "Something went wrong"
                        if (status === 503 || status === 429) {
                            failure_status = 503
                            failure_text = "The AI is busy right now. Please try again in a moment."
                        } else if (status === 408) {
                            failure_status = 503
                            failure_text = "The AI took too long to respond. Please try again."
                        } else if (status === 404) {
                            failure_status = 503
                            failure_text = "The AI model is unavailable right now. Please try again later."
                        } else if (status === 402) {
                            failure_status = 503
                            failure_text = "The AI service is unavailable right now. Please try again later."
                        } else if (status === 401 || status === 403) {
                            failure_status = 500
                            failure_text = "The AI service is not configured correctly."
                        }
                        send({ type: "error", status: failure_status, error: failure_text })
                        await saveFailure(failure_text)
                        return
                    }

                    mark("generation finished")

                    console.log("model:", output.model, "finish:", output.finish, "chars:", output.text?.length)

                    if (!output.text && output.finish === "length") {
                        console.log("token budget used up before any visible output")
                        const failure_text =
                            "The model used its whole token budget before writing a reply. Please try again."
                        send({ type: "error", status: 502, error: failure_text })
                        await saveFailure(failure_text)
                        return
                    }

                    let reply
                    try {
                        reply = parseReply(output.text)
                    } catch {
                        const plain = stripThinking(output.text)
                        const looks_like_json = plain.startsWith("{") || plain.includes('"files"')
                        if (plain && !looks_like_json) {
                            reply = { type: "chat", message: plain }
                        } else if (used_tools && !plain) {
                            reply = { type: "chat", message: "The request was processed." }
                        } else {
                            console.log("JSON parse failed. Head:", String(output.text).slice(0, 300))
                            console.log("JSON parse failed. Tail:", String(output.text).slice(-200))
                            const failure_text =
                                "The response was cut off. Try a simpler request or ask for fewer screens."
                            send({ type: "error", status: 502, error: failure_text })
                            await saveFailure(failure_text)
                            return
                        }
                    }

                    let files = Array.isArray(reply.files) || (reply.files && typeof reply.files === "object")
                        ? normalizeFiles(reply.files)
                        : []
                    const blocks = Array.isArray(reply.blocks)
                        ? reply.blocks.filter((b) => b && typeof b.code === "string")
                        : []

                    if (files.some((f) => f.path === MOBILE_PACKAGE_PATH)) {
                        files = await pinPackageFiles(files)
                        mark("packages pinned")
                    }

                    console.log("reply keys:", Object.keys(reply), "files parsed:", files.length)

                    const existing = new Map(project_files.map((f) => [f.path, f.content]))
                    const merged = new Map(project_files.map((f) => [f.path, f]))
                    for (const f of files) merged.set(f.path, f)

                    let check_note = ""
                    let remaining_problems = []

                    if (files.length > 0) {
                        send({ type: "status", text: "Checking code" })

                        const checkAll = async (include_code) => {
                            const design_result =
                                reply.design && typeof reply.design === "object"
                                    ? validateDesignAndTheme(merged, reply.design)
                                    : { problems: [], design: null }
                            if (design_result.design) reply.design = design_result.design
                            const package_problems = missingPackageProblems(merged)
                            const structure_problems = [
                                ...missingLocalProblems(merged),
                                ...requiredExportProblems(merged),
                                ...undefinedComponentProblems(merged),
                            ]
                            const code_problems = include_code ? await runValidation(merged) : []
                            return [
                                ...design_result.problems,
                                ...package_problems,
                                ...structure_problems,
                                ...code_problems,
                            ]
                        }

                        const can_check = Date.now() - started_at < REQUEST_LIMIT_MS - CHECK_BUDGET_MS
                        if (!can_check) console.log("code check skipped: not enough time left in the request")

                        let problems = await checkAll(can_check)
                        mark("first check done")
                        const initial_count = problems.length
                        if (initial_count > 0) {
                            console.log("validation found", initial_count, "problems:", problems.slice(0, 5))
                        }

                        const reply_files = new Map(files.map((f) => [f.path, f]))
                        let last_signature = ""
                        let repairs = 0
                        const repair_started = Date.now()

                        while (problems.length > 0) {
                            if (repairs >= MAX_REPAIRS) {
                                console.log("repair skipped: reached MAX_REPAIRS", MAX_REPAIRS)
                                break
                            }
                            if (
                                Date.now() - repair_started >= REPAIR_BUDGET_MS ||
                                Date.now() - started_at >= REQUEST_LIMIT_MS
                            ) {
                                console.log("repair skipped: out of time")
                                break
                            }

                            const signature = JSON.stringify(problems.map(problemText))
                            if (signature === last_signature) {
                                console.log("repair made no progress, stopping")
                                break
                            }
                            last_signature = signature
                            repairs++

                            send({
                                type: "status",
                                text: `Fixing ${problems.length} problem${problems.length === 1 ? "" : "s"}`,
                            })

                            const before = problems
                            const merged_snapshot = new Map(merged)
                            const reply_snapshot = new Map(reply_files)

                            try {
                                const fixed = await pinPackageFiles(
                                    normalizeFiles(await fixFiles([...merged.values()], problems))
                                )
                                if (fixed.length === 0) {
                                    console.log("repair failed: no files returned")
                                    break
                                }
                                for (const f of fixed) {
                                    merged.set(f.path, f)
                                    reply_files.set(f.path, f)
                                }
                            } catch (e) {
                                console.log("repair failed:", e?.message)
                                break
                            }

                            mark("repair " + repairs + " applied")

                            const can_recheck = Date.now() - started_at < REQUEST_LIMIT_MS - CHECK_BUDGET_MS
                            problems = await checkAll(can_recheck)

                            if (problems.length > before.length) {
                                console.log("repair made things worse, reverting")
                                merged.clear()
                                for (const [k, v] of merged_snapshot) merged.set(k, v)
                                reply_files.clear()
                                for (const [k, v] of reply_snapshot) reply_files.set(k, v)
                                problems = before
                                break
                            }
                        }

                        files = [...reply_files.values()]
                        remaining_problems = problems

                        if (initial_count > 0 && problems.length === 0) {
                            check_note = `\n\nAuto-fixed ${initial_count} problem${initial_count === 1 ? "" : "s"} found by the code check.`
                        }
                    }

                    send({ type: "status", text: "Saving" })

                    const backend_files = [...merged.keys()].filter((p) => p.startsWith("backend/"))
                    const changed_files = files.filter((f) => existing.get(f.path) !== f.content)
                    const error_details =
                        remaining_problems.length > 0 ? remaining_problems.slice(0, 20).map(toErrorDetail) : null

                    reply.files = files
                    reply.blocks = blocks
                    reply.sql = String(reply.sql ?? "")
                    reply.pending_sql = pending_sql
                    reply.type = files.length > 0 ? "code" : blocks.length > 0 ? "block_code" : "chat"
                    reply.folder_name = reply.type === "code" ? slugify(reply.folder_name) || "expo-app" : ""
                    reply.message = String(reply.message ?? "") + check_note
                    reply.title = String(reply.title ?? "").slice(0, 30) || "Expo App"
                    reply.error_details = error_details

                    reply.changed_paths = changed_files.map((f) => ({
                        path: f.path,
                        status: existing.has(f.path) ? "modified" : "added",
                    }))
                    reply.files = []

                    console.log(
                        "type:", reply.type,
                        "files:", files.length,
                        "project files:", merged.size,
                        "backend files:", backend_files.length,
                        "blocks:", blocks.length,
                        "problems left:", remaining_problems.length
                    )

                    const [human_result] = await human_saved
                    if (human_result?.error) throw human_result.error

                    const chat_update = {}
                    if (is_first_message) chat_update.title = reply.title
                    if (reply.type === "code") chat_update.folder_name = reply.folder_name

                    const [, insert_result, chat_result] = await Promise.all([
                        saveFiles(user_id, chat_id, changed_files),
                        supabase.from("conversations").insert({
                            user_id,
                            chat_id,
                            role: "ai",
                            message: JSON.stringify(reply),
                            created_at: new Date().toISOString(),
                        }),
                        Object.keys(chat_update).length > 0
                            ? supabase.from("chats").update(chat_update).eq("id", chat_id)
                            : Promise.resolve({ error: null }),
                    ])
                    if (insert_result.error) throw insert_result.error
                    if (chat_result.error) console.log("chat update failed:", chat_result.error.message)

                    const tokensUsed = Number(output.usage?.total_tokens ?? 0)

                    console.log("tokens used", tokensUsed)

                    if (tokensUsed > 0) {
                        const { data: remaining, error: token_err } = await supabase.rpc("deduct_tokens", {
                            p_user: user_id,
                            p_amount: tokensUsed,
                        })
                        if (token_err) console.log("token deduction failed:", token_err.message)
                        else console.log("remaining tokens:", remaining)
                    }

                    mark("done")

                    send({
                        type: "done",
                        chat_id,
                        reply_type: reply.type,
                        response: reply,
                        error_details,
                        changed_files,
                        has_backend: backend_files.length > 0,
                        backend_files,
                    })
                } catch (e) {
                    console.log(e)
                    send({ type: "error", status: 500, error: "Something went wrong" })
                } finally {
                    closed = true
                    if (claim.claimed) await releaseBuild(user_id)
                    try {
                        controller.close()
                    } catch {}
                }
            },
        })

        return new Response(stream, { headers: sseHeaders })
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
    }
}