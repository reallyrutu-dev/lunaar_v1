import express from "express"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { builtinModules } from "node:module"
import { execFile } from "node:child_process"

const app = express()
app.use(express.json({ limit: "10mb" }))

const IS_WINDOWS = process.platform === "win32"
const TEMPLATE_DIR = path.resolve(process.env.TEMPLATE_DIR || "/opt/expo-template")
const CACHE_DIR = process.env.DEPS_CACHE_DIR || path.join(os.tmpdir(), "deps-cache")
const TOKEN = (process.env.SANDBOX_TOKEN || "").trim()
const MAX_PROBLEMS = 40
const MAX_NEW_PACKAGES = 24

if (!TOKEN) {
    console.error("SANDBOX_TOKEN is not set")
    process.exit(1)
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const BLOCKED_PACKAGES = new Set([
    "expo-router",
    "expo-linking",
    "react-native-reanimated",
    "react-native-worklets",
    "react-native-gesture-handler",
])
const CORE_PACKAGES = ["expo", "react", "react-dom", "react-native", "react-native-web", "@expo/metro-runtime"]
const PINNED_DEV_PACKAGES = ["typescript", "@types/react"]
const IGNORED = new Set(["react", "react-native", "expo", "expo-modules-core"])
const BUILTINS = new Set(builtinModules)

const TSC_LINE = /^([\w./@()[\]-]+\.(?:tsx?|jsx?))\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/
const METRO_RESOLVE = /Unable to resolve module\s+(\S+)\s+from\s+(\S+?):/
const METRO_SYNTAX = /SyntaxError:\s+(\S+?\.(?:tsx?|jsx?)):\s*(.+?)\s*\((\d+):(\d+)\)/
const IMPORT_PATTERNS = [
    /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
]
const SKIP_PREFIXES = [".", "/", "@/", "~/", "node:"]

const pending = new Map()

const authorized = (header) => {
    const expected = Buffer.from(`Bearer ${TOKEN}`)
    const received = Buffer.from(String(header || "").trim())
    return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

const run = (cmd, args, cwd, timeout) =>
    new Promise((resolve) => {
        execFile(
            cmd,
            args,
            {
                cwd,
                timeout,
                shell: IS_WINDOWS,
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
                env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
            },
            (error, stdout, stderr) => {
                const spawnFailed = !!error && ["ENOENT", "EINVAL", "EACCES"].includes(String(error.code))
                resolve({ ok: !error, spawnFailed, output: `${stdout}\n${stderr}`.trim() })
            }
        )
    })

const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"))
    } catch {
        return null
    }
}

const depNames = (pkg) => new Set([...Object.keys(pkg?.dependencies || {}), ...Object.keys(pkg?.devDependencies || {})])

const relative = (workDir, filePath) => {
    const clean = String(filePath).replace(/\\/g, "/")
    const base = workDir.replace(/\\/g, "/")
    return clean.startsWith(base) ? clean.slice(base.length).replace(/^\/+/, "") : clean.replace(/^\.\//, "")
}

const parseTsc = (text) => {
    const problems = []
    for (const line of String(text || "").split("\n")) {
        const m = line.trim().match(TSC_LINE)
        if (!m) continue
        problems.push({
            path: m[1],
            line: Number(m[2]),
            column: Number(m[3]),
            message: `${m[4]}: ${m[5]}`,
            source: "types",
        })
    }
    return problems
}

const parseMetro = (text, workDir) => {
    const problems = []
    for (const line of String(text || "").split("\n")) {
        const resolve = line.match(METRO_RESOLVE)
        if (resolve) {
            problems.push({
                path: relative(workDir, resolve[2]),
                line: null,
                column: null,
                message: `Unable to resolve module ${resolve[1]}`,
                source: "bundle",
            })
            continue
        }
        const syntax = line.match(METRO_SYNTAX)
        if (syntax) {
            problems.push({
                path: relative(workDir, syntax[1]),
                line: Number(syntax[3]),
                column: Number(syntax[4]),
                message: syntax[2],
                source: "bundle",
            })
        }
    }
    return problems
}

const packageName = (spec) => {
    const parts = spec.split("/")
    return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const packageProblem = (filePath, line, message) => ({
    path: filePath,
    line,
    column: null,
    message,
    source: "packages",
})

const folderOf = (filePath) => {
    const first = String(filePath).split("/")[0]
    return first === "mobile" || first === "backend" ? first : ""
}

const checkImports = (files, declared) => {
    const problems = []
    for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(filePath)) continue
        const folder = folderOf(filePath)
        const names = declared[folder]
        if (!folder || !names) continue
        const reported = new Set()

        String(content)
            .split("\n")
            .forEach((text, index) => {
                for (const pattern of IMPORT_PATTERNS) {
                    pattern.lastIndex = 0
                    let m
                    while ((m = pattern.exec(text)) !== null) {
                        const spec = m[1]
                        if (SKIP_PREFIXES.some((p) => spec.startsWith(p))) continue
                        const name = packageName(spec)
                        if (BUILTINS.has(name) || names.has(name) || reported.has(name)) continue
                        reported.add(name)
                        problems.push(
                            packageProblem(
                                filePath,
                                index + 1,
                                `Package "${name}" is imported but not listed in ${folder}/package.json. Add it to dependencies or remove the import.`
                            )
                        )
                    }
                }
            })
    }
    return problems
}

const existsOnNpm = async (name) => {
    const result = await run("npm", ["view", name, "version"], os.tmpdir(), 20000)
    if (result.ok) return true
    if (result.spawnFailed) return null
    if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i.test(result.output)) return null
    return /E404|404 Not Found|is not in this registry/i.test(result.output) ? false : null
}

const hasNativeCode = (dir) =>
    fs.existsSync(path.join(dir, "android")) ||
    fs.existsSync(path.join(dir, "ios")) ||
    fs.existsSync(path.join(dir, "expo-module.config.json"))

const isIgnored = (name) => IGNORED.has(name) || name.startsWith("@types/") || name.startsWith("@react-native/")

const findNativeProblems = (modulesDir, roots) => {
    const bundled = readJson(path.join(modulesDir, "expo", "bundledNativeModules.json")) || {}
    const problems = []
    const visited = new Set()
    const queue = roots.map((name) => ({ name, via: "" }))

    while (queue.length > 0) {
        const { name, via } = queue.shift()
        if (visited.has(name) || isIgnored(name)) continue
        visited.add(name)

        const dir = path.join(modulesDir, name)
        const pkg = readJson(path.join(dir, "package.json"))
        if (!pkg) continue

        if (hasNativeCode(dir) && !(name in bundled)) {
            const origin = via ? ` (required by "${via}")` : ""
            problems.push(
                packageProblem(
                    "mobile/package.json",
                    null,
                    `Package "${name}"${origin} contains native code that is not included in Expo Go. On a phone it crashes with "Verify that a module by this name is registered in the native binary". Remove the package that needs it and use a JavaScript-only or Expo SDK alternative.`
                )
            )
            continue
        }

        for (const dep of Object.keys(pkg.dependencies || {})) {
            if (!visited.has(dep)) queue.push({ name: dep, via: via || name })
        }
    }

    return problems
}

const templateFingerprint = () => {
    const file = path.join(TEMPLATE_DIR, "package.json")
    const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12)
}

const linkModules = (source, target) => {
    fs.symlinkSync(path.resolve(source), target, IS_WINDOWS ? "junction" : "dir")
}

const copyModules = async (source, target, cwd) => {
    if (!IS_WINDOWS) {
        const linked = await run("cp", ["-al", source, target], cwd, 120000)
        if (linked.ok) return
        fs.rmSync(target, { recursive: true, force: true })
    }
    fs.cpSync(source, target, { recursive: true })
}

const removeWorkDir = (workDir) => {
    const link = path.join(workDir, "node_modules")
    try {
        if (fs.lstatSync(link).isSymbolicLink()) {
            try {
                fs.unlinkSync(link)
            } catch {
                fs.rmdirSync(link)
            }
        }
    } catch {}
    fs.rmSync(workDir, { recursive: true, force: true })
}

const buildDeps = async (key, wanted) => {
    const dir = path.join(CACHE_DIR, key)
    const marker = path.join(dir, "result.json")
    const cached = readJson(marker)
    if (cached) return { ...cached, dir: cached.installed ? dir : null }

    const checks = await Promise.all(wanted.map(async (name) => ({ name, found: await existsOnNpm(name) })))
    const missing = checks.filter((c) => c.found === false).map((c) => c.name)
    const installable = wanted.filter((name) => !missing.includes(name))
    const problems = missing.map((name) =>
        packageProblem("mobile/package.json", null, `Package "${name}" does not exist on npm. Remove it or use a real package.`)
    )

    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })

    if (installable.length === 0) {
        const result = { installed: false, resolved: {}, problems }
        fs.writeFileSync(marker, JSON.stringify(result))
        return { ...result, dir: null }
    }

    fs.copyFileSync(path.join(TEMPLATE_DIR, "package.json"), path.join(dir, "package.json"))
    const lock = path.join(TEMPLATE_DIR, "package-lock.json")
    if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(dir, "package-lock.json"))

    await copyModules(path.join(TEMPLATE_DIR, "node_modules"), path.join(dir, "node_modules"), dir)

    const install = await run(
        "npx",
        ["expo", "install", ...installable, "--", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
        dir,
        240000
    )

    if (!install.ok) {
        fs.rmSync(dir, { recursive: true, force: true })
        return {
            installed: false,
            resolved: {},
            dir: null,
            problems: [
                ...problems,
                packageProblem(
                    "mobile/package.json",
                    null,
                    `Could not install ${installable.join(", ")}: ${install.output.slice(-300)}`
                ),
            ],
        }
    }

    const installedPkg = readJson(path.join(dir, "package.json")) || {}
    const resolved = {}

    for (const name of installable) {
        const version = installedPkg.dependencies?.[name]
        if (version) resolved[name] = version
    }

    const result = { installed: true, resolved, problems }
    fs.writeFileSync(marker, JSON.stringify(result))
    return { ...result, dir }
}

const ensureDeps = (wanted) => {
    const key = crypto
        .createHash("sha256")
        .update(`${templateFingerprint()}:${[...wanted].sort().join(",")}`)
        .digest("hex")
        .slice(0, 16)
    if (!pending.has(key)) {
        const job = buildDeps(key, wanted).finally(() => pending.delete(key))
        pending.set(key, job)
    }
    return pending.get(key)
}

const readFolderPackage = (files, folder, problems) => {
    const raw = files[`${folder}/package.json`]
    if (typeof raw !== "string") return null
    try {
        return JSON.parse(raw)
    } catch {
        problems.push(packageProblem(`${folder}/package.json`, null, `${folder}/package.json is not valid JSON.`))
        return null
    }
}

const pinPackage = (mobilePkg, templatePkg, resolved) => {
    const dependencies = {}
    for (const [name, version] of Object.entries(mobilePkg.dependencies || {})) {
        if (BLOCKED_PACKAGES.has(name)) continue
        dependencies[name] = templatePkg.dependencies?.[name] ?? resolved[name] ?? version
    }
    for (const name of CORE_PACKAGES) {
        if (templatePkg.dependencies?.[name]) dependencies[name] = templatePkg.dependencies[name]
    }

    const devDependencies = { ...(mobilePkg.devDependencies || {}) }
    for (const name of PINNED_DEV_PACKAGES) {
        if (templatePkg.devDependencies?.[name]) devDependencies[name] = templatePkg.devDependencies[name]
    }

    return {
        ...mobilePkg,
        main: "node_modules/expo/AppEntry.js",
        dependencies,
        devDependencies,
    }
}

const resolveMobilePackage = async (mobilePkg, problems) => {
    const templatePkg = readJson(path.join(TEMPLATE_DIR, "package.json")) || {}
    const templateNames = depNames(templatePkg)
    const names = Object.keys(mobilePkg.dependencies || {})
    const wanted = []

    for (const name of names) {
        if (BLOCKED_PACKAGES.has(name)) {
            problems.push(packageProblem("mobile/package.json", null, `Package "${name}" is not allowed in this project. Remove it.`))
            continue
        }
        if (!PACKAGE_NAME.test(name)) {
            problems.push(packageProblem("mobile/package.json", null, `"${name}" is not a valid package name.`))
            continue
        }
        if (!templateNames.has(name)) wanted.push(name)
    }

    if (wanted.length > MAX_NEW_PACKAGES) {
        problems.push(
            packageProblem(
                "mobile/package.json",
                null,
                `Too many packages (${wanted.length}). Use at most ${MAX_NEW_PACKAGES} packages beyond the ones the template already has.`
            )
        )
        return { roots: [], depsDir: null, patched: null, resolved: {} }
    }

    let depsDir = null
    let resolved = {}

    if (wanted.length > 0) {
        const built = await ensureDeps(wanted)
        problems.push(...built.problems)
        depsDir = built.dir
        resolved = built.resolved
    }

    return { roots: names, depsDir, patched: pinPackage(mobilePkg, templatePkg, resolved), resolved }
}

const resolvePackages = async (files, problems) => {
    const templatePkg = readJson(path.join(TEMPLATE_DIR, "package.json")) || {}
    const templateNames = depNames(templatePkg)
    const mobilePkg = readFolderPackage(files, "mobile", problems)
    const backendPkg = readFolderPackage(files, "backend", problems)

    const declared = {
        mobile: mobilePkg ? depNames(mobilePkg) : templateNames,
        backend: backendPkg ? depNames(backendPkg) : null,
    }

    if (!mobilePkg) return { declared, roots: [], depsDir: null, patched: null, resolved: {} }

    const result = await resolveMobilePackage(mobilePkg, problems)
    return { declared, ...result }
}

const prepareWorkDir = (files, depsDir) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-"))

    fs.cpSync(TEMPLATE_DIR, workDir, {
        recursive: true,
        filter: (src) => !src.split(path.sep).includes("node_modules"),
    })

    const modulesSource = path.join(depsDir || TEMPLATE_DIR, "node_modules")
    if (fs.existsSync(modulesSource)) {
        linkModules(modulesSource, path.join(workDir, "node_modules"))
    }

    for (const [filePath, content] of Object.entries(files)) {
        const safe = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "")
        const target = path.join(workDir, safe)
        if (!target.startsWith(workDir)) continue
        if (safe === "package.json" || safe.startsWith("node_modules")) continue
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, String(content))
    }

    return workDir
}

app.get("/health", (req, res) => res.json({ ok: true }))

app.post("/resolve", async (req, res) => {
    if (!authorized(req.headers.authorization)) {
        return res.status(401).json({ ok: false, packageJson: null, problems: [] })
    }

    const problems = []

    try {
        const raw = req.body.packageJson
        const mobilePkg = typeof raw === "string" ? JSON.parse(raw) : null
        if (!mobilePkg || typeof mobilePkg !== "object") {
            return res.status(400).json({ ok: false, packageJson: null, problems: [] })
        }

        const { patched, resolved } = await resolveMobilePackage(mobilePkg, problems)

        return res.json({
            ok: problems.length === 0,
            packageJson: patched ? JSON.stringify(patched, null, 2) : null,
            resolved,
            problems,
        })
    } catch (err) {
        return res.json({
            ok: false,
            packageJson: null,
            problems: [packageProblem("mobile/package.json", null, String(err).slice(0, 300))],
        })
    }
})

app.post("/check", async (req, res) => {
    const header = req.headers.authorization

    if (!authorized(header)) {
        console.warn("unauthorized /check", {
            hasHeader: !!header,
            receivedLength: String(header || "").trim().length,
            expectedLength: `Bearer ${TOKEN}`.length,
        })
        return res.status(401).json({ ok: false, problems: [], errors: "unauthorized" })
    }

    const files = req.body.files || {}
    const wantBundle = req.body.bundle === true
    let workDir = ""

    try {
        const packageProblems = []
        const { declared, roots, depsDir, patched, resolved } = await resolvePackages(files, packageProblems)
        packageProblems.push(...checkImports(files, declared))

        const modulesDir = path.join(depsDir || TEMPLATE_DIR, "node_modules")
        packageProblems.push(...findNativeProblems(modulesDir, roots))

        workDir = prepareWorkDir(files, depsDir)

        const tsc = await run("npx", ["tsc", "--noEmit", "--pretty", "false"], workDir, 60000)
        const typeProblems = tsc.ok ? [] : parseTsc(tsc.output)

        let bundleProblems = []
        let bundleRaw = ""
        const clean = packageProblems.length === 0 && typeProblems.length === 0 && tsc.ok

        if (wantBundle && clean) {
            const bundle = await run(
                "npx",
                ["expo", "export", "--platform", "web", "--platform", "android", "--output-dir", "dist"],
                workDir,
                150000
            )
            if (!bundle.ok) {
                bundleRaw = bundle.output
                bundleProblems = parseMetro(bundle.output, workDir)
                if (bundleProblems.length === 0) {
                    bundleProblems = [
                        {
                            path: "",
                            line: null,
                            column: null,
                            message: bundle.output.slice(-500),
                            source: "bundle",
                        },
                    ]
                }
            }
        }

        const problems = [...packageProblems, ...typeProblems, ...bundleProblems].slice(0, MAX_PROBLEMS)

        if (problems.length === 0 && !tsc.ok) {
            problems.push({
                path: "",
                line: null,
                column: null,
                message: tsc.output.slice(0, 500),
                source: "types",
            })
        }

        return res.json({
            ok: problems.length === 0,
            problems,
            packageJson: patched ? JSON.stringify(patched, null, 2) : null,
            resolved,
            errors: [tsc.ok ? "" : tsc.output, bundleRaw].filter(Boolean).join("\n").slice(0, 8000),
        })
    } catch (err) {
        return res.json({
            ok: false,
            problems: [{ path: "", line: null, column: null, message: String(err).slice(0, 500), source: "sandbox" }],
            errors: String(err),
        })
    } finally {
        if (workDir) removeWorkDir(workDir)
    }
})

app.listen(process.env.PORT || 4000)