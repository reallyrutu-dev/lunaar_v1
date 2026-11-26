import express from "express"
import crypto from "crypto"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { execFile } from "child_process"

const PORT = Number(process.env.PORT) || 3000
const SECRET = process.env.SANDBOX_SECRET
const MAX_JOBS = Number(process.env.MAX_JOBS) || 2
const TSC_TIMEOUT_MS = Number(process.env.TSC_TIMEOUT_MS) || 50000
const TEMPLATE_DIR = path.resolve("template")
const TSC_BIN = path.join(TEMPLATE_DIR, "node_modules", "typescript", "bin", "tsc")

const TSCONFIG = {
    compilerOptions: {
        target: "esnext",
        module: "esnext",
        moduleResolution: "bundler",
        lib: ["esnext"],
        jsx: "react-native",
        strict: false,
        noEmit: true,
        skipLibCheck: true,
        allowJs: true,
        checkJs: false,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: true,
    },
    include: ["mobile/**/*"],
    exclude: ["mobile/node_modules"],
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/

let running = 0
const waiting = []

const acquire = () =>
    new Promise((resolve) => {
        if (running < MAX_JOBS) {
            running++
            resolve()
        } else {
            waiting.push(resolve)
        }
    })

const release = () => {
    const next = waiting.shift()
    if (next) next()
    else running--
}

const safePath = (value) => {
    const clean = String(value || "").replace(/\\/g, "/")
    if (!clean || clean.startsWith("/") || clean.split("/").includes("..")) return null
    return clean
}

const runTsc = (cwd) =>
    new Promise((resolve) => {
        execFile(
            process.execPath,
            [TSC_BIN, "-p", "tsconfig.json", "--pretty", "false"],
            { cwd, timeout: TSC_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
                resolve({ stdout: String(stdout || ""), stderr: String(stderr || ""), killed: Boolean(error?.killed) })
            }
        )
    })

const parseTsc = (output) => {
    const problems = []
    for (const line of output.split("\n")) {
        const m = line.trim().match(TSC_LINE)
        if (!m) continue
        problems.push({
            path: m[1],
            line: Number(m[2]),
            column: Number(m[3]),
            message: `${m[4]}: ${m[5]}`,
            source: "tsc",
        })
    }
    return problems
}

const validate = async (files) => {
    const jobDir = path.join(os.tmpdir(), `job-${crypto.randomUUID()}`)
    try {
        await fs.mkdir(path.join(jobDir, "mobile"), { recursive: true })
        await fs.symlink(path.join(TEMPLATE_DIR, "node_modules"), path.join(jobDir, "mobile", "node_modules"), "dir")
        await fs.writeFile(path.join(jobDir, "tsconfig.json"), JSON.stringify(TSCONFIG))

        for (const file of files) {
            const rel = safePath(file.path)
            if (!rel || !rel.startsWith("mobile/") || typeof file.content !== "string") continue
            const target = path.join(jobDir, rel)
            await fs.mkdir(path.dirname(target), { recursive: true })
            await fs.writeFile(target, file.content)
        }

        const result = await runTsc(jobDir)
        if (result.killed) {
            return [{ source: "sandbox", message: "Type check timed out" }]
        }
        return parseTsc(result.stdout)
    } finally {
        await fs.rm(jobDir, { recursive: true, force: true })
    }
}

const app = express()
app.use(express.json({ limit: "10mb" }))

app.get("/health", (req, res) => res.json({ status: "ok" }))

app.post("/validate", async (req, res) => {
    const header = req.get("x-sandbox-secret") || ""
    const a = Buffer.from(header)
    const b = Buffer.from(SECRET || "")
    if (!SECRET || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: "Unauthorized" })
    }
    if (!Array.isArray(req.body?.files)) {
        return res.status(400).json({ error: "files is required" })
    }

    await acquire()
    try {
        const problems = await validate(req.body.files)
        res.json({ problems })
    } catch (e) {
        res.json({ problems: [{ source: "sandbox", message: e?.message || "Sandbox failed" }] })
    } finally {
        release()
    }
})

app.listen(PORT, "0.0.0.0", () => console.log(`sandbox listening on ${PORT}`))