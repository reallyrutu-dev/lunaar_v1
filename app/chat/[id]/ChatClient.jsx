"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "../../auth/AuthContext"
import supabase from "../../utils/supabase_browser"
import FileSystem from "../../components/FileSystem"
import SnackPreview from "../../components/SnackPreview"
import SupabaseSettings from "../../components/SupabaseSettings"
import { injectKeys } from "../../utils/injectKeys"
import { fileToResizedDataUrl } from "../../utils/ImageUtils"
import styles from "../chat.module.css"
import {
    AppWindow,
    CodeXml,
    ArrowLeft,
    MonitorSmartphone,
    X,
    ArrowUp,
    Copy,
    Check,
    Plus,
    Square,
    GitBranch,
    FolderCode,
    Server,
    KeyRound,
    Wrench,
    Braces,
    Download,
} from "lucide-react"
import { streamChat } from "../../api/chat/streamChat"
import db from "../../../public/db.png"
import logo from "../../../public/logo.png"

// Base URL for every backend call. Set NEXT_PUBLIC_BACKEND_URL in .env.local
// (no trailing slash needed). If it is empty, calls go to the same origin.
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
const apiUrl = (path) => `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`

const started_chats = new Set()

const MAX_IMAGES = 4
const IMAGE_BUCKET = "Images"

const MANAGED_ENV_KEYS = ["PORT", "NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]

const BUILD_STEPS = [
    "Making a plan",
    "Outlining screens",
    "Designing the layout",
    "Writing components",
    "Wiring up navigation",
    "Setting up the backend",
    "Reviewing the code",
    "Finalizing files",
]

const useProgressNote = (active, steps = BUILD_STEPS, intervalMs = 3000) => {
    const [index, setIndex] = useState(0)

    useEffect(() => {
        if (!active) {
            setIndex(0)
            return
        }
        const timer = setInterval(() => {
            setIndex((current) => Math.min(current + 1, steps.length - 1))
        }, intervalMs)
        return () => clearInterval(timer)
    }, [active, steps, intervalMs])

    return steps[index]
}

function normalizeRow(row) {
    if (row.role === "human") {
        return {
            role: "human",
            type: "chat",
            message: String(row.message ?? ""),
            images: Array.isArray(row.images) ? row.images : [],
        }
    }
    try {
        const parsed = JSON.parse(row.message)
        if (parsed && typeof parsed === "object") {
            return {
                role: "ai",
                type: parsed.type === "code" || parsed.type === "block_code" ? parsed.type : "chat",
                message: String(parsed.message ?? ""),
                folder_name: parsed.folder_name,
                language: parsed.language,
                files: Array.isArray(parsed.files) ? parsed.files : [],
                blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
                changed_paths: Array.isArray(parsed.changed_paths) ? parsed.changed_paths : [],
                pending_sql: typeof parsed.pending_sql === "string" ? parsed.pending_sql : "",
            }
        }
    } catch {}
    return { role: "ai", type: "chat", message: String(row.message ?? ""), files: [], blocks: [], pending_sql: "" }
}

function parsePending(raw) {
    try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
            return {
                message: parsed.message,
                images: Array.isArray(parsed.images) ? parsed.images : [],
            }
        }
    } catch {}
    return { message: String(raw ?? ""), images: [] }
}

function normalizeCommit(c) {
    const author =
        typeof c.author === "string"
            ? c.author
            : c.author?.name || c.author?.login || c.commit?.author?.name || ""

    return {
        sha: String(c.sha || ""),
        message: String(c.message ?? c.commit?.message ?? "").split("\n")[0],
        author,
        date: c.date || c.commit?.author?.date || "",
        url: c.url || c.html_url || "",
    }
}

function formatCommitDate(value) {
    if (!value) return ""
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
}

async function uploadImages(user_id, chat_id, sources) {
    const uploaded = []
    try {
        return await Promise.all(
            sources.map(async (src) => {
                if (!src.startsWith("data:")) return src

                const blob = await (await fetch(src)).blob()
                const path = `${user_id}/${chat_id}/${crypto.randomUUID()}.jpg`
                const { error } = await supabase.storage
                    .from(IMAGE_BUCKET)
                    .upload(path, blob, { contentType: "image/jpeg" })
                if (error) throw error

                uploaded.push(path)
                return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
            })
        )
    } catch (e) {
        if (uploaded.length > 0) await supabase.storage.from(IMAGE_BUCKET).remove(uploaded)
        throw e
    }
}

function CodeBlock({ block }) {
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(block.code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {}
    }

    return (
        <div className={styles.code_block}>
            <div className={styles.code_head}>
                <span>
                    {block.label}
                    {block.language ? ` · ${block.language}` : ""}
                </span>
                <button onClick={copy} aria-label="Copy code" className={styles.copy_btn}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className={styles.code_pre}>
                <code>{block.code}</code>
            </pre>
        </div>
    )
}

function CommitTree({ commits }) {
    return (
        <div className={styles.tree}>
            <div className={styles.tree_branch}>
                <GitBranch size={13} />
                <span>main</span>
            </div>
            <ul className={styles.tree_list}>
                {commits.map((c, i) => {
                    const date = formatCommitDate(c.date)
                    const meta = [c.author, date].filter(Boolean).join(" · ")
                    const body = (
                        <>
                            <span className={styles.commit_top}>
                                <span className={styles.commit_msg}>{c.message || "No message"}</span>
                                {i === 0 && <span className={styles.tree_head_tag}>latest</span>}
                            </span>
                            <span className={styles.commit_meta}>
                                {!!c.sha && <span className={styles.commit_sha}>{c.sha.slice(0, 7)}</span>}
                                {meta}
                            </span>
                        </>
                    )

                    return (
                        <li key={c.sha || i} className={styles.tree_item}>
                            <span className={`${styles.tree_node} ${i === 0 ? styles.tree_node_head : ""}`} />
                            {c.url ? (
                                <a href={c.url} target="_blank" rel="noreferrer" className={styles.tree_card}>
                                    {body}
                                </a>
                            ) : (
                                <div className={styles.tree_card}>{body}</div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export default function ChatClient() {
    const router = useRouter()
    const { id: chat_id } = useParams()
    const { user, session, loading } = useAuth()

    const user_id = user?.id
    const has_session = !!session

    const [messages, setMessages] = useState([])
    const [input, setInput] = useState("")
    const [images, setImages] = useState([])
    const [sending, setSending] = useState(false)
    const [error, setError] = useState("")
    const [project, setProject] = useState(null)
    const [keys, setKeys] = useState(null)
    const [open_panel, setOpen_panel] = useState(false)
    const [tab, setTab] = useState("files")
    const [visited, setVisited] = useState({ files: true })
    const bottom_ref = useRef(null)
    const file_ref = useRef(null)
    const [details, setDetails] = useState(null)
    const [render_panel, setRender_panel] = useState(false)
    const note = useProgressNote(sending)
    const [render_key, setRender_key] = useState("")
    const [commits, setCommits] = useState([])
    const [commits_state, setCommits_state] = useState({ loading: false, error: "" })
    const [apk, setApk] = useState({ phase: "idle", run_url: "", error: "" })
    const [migration_state, setMigration_state] = useState({})
    const [error_details, setError_details] = useState(null)
    const apk_timer = useRef(null)
    const [env_rows, setEnv_rows] = useState([])
    const [env_saved, setEnv_saved] = useState([])
    const [env_busy, setEnv_busy] = useState(false)
    const [env_status, setEnv_status] = useState({ text: "", kind: "" })

    const [progress, setProgress] = useState({ status: "", files: [], chars: 0 })
    const abort_ref = useRef(null)

    const isBackend = useMemo(
        () => !!project?.files?.some((f) => f.path?.startsWith("backend/")),
        [project]
    )

    const first_message = useMemo(
        () => messages.find((m) => m.role === "human")?.message ?? "",
        [messages]
    )

    const has_errors = Array.isArray(error_details) && error_details.length > 0

    const suggested_env_keys = useMemo(() => {
        const file = project?.files?.find((f) => f.path === "backend/.env.example")
        if (!file || typeof file.content !== "string") return []
        const found = []
        for (const line of file.content.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/)
            if (match && !MANAGED_ENV_KEYS.includes(match[1]) && !found.includes(match[1])) {
                found.push(match[1])
            }
        }
        return found
    }, [project])

    const missing_env_keys = useMemo(
        () =>
            suggested_env_keys.filter(
                (key) => !env_rows.some((row) => row.key.trim().toUpperCase() === key)
            ),
        [suggested_env_keys, env_rows]
    )

    const loadDetails = async () => {
        if (!user) return
        const { data, error } = await supabase
            .from("chats")
            .select("*")
            .eq("id", chat_id)
            .eq("user_id", user.id)
            .maybeSingle()

        if (error) {
            console.log(error)
            return
        }
        if (data) setDetails(data)
    }

    const loadProject = async (folder_name) => {
    try {
        const { data: { session: fresh } } = await supabase.auth.getSession()
        const uid = fresh?.user?.id
        if (!uid) {
            setError("Please sign in again to load project files")
            return null
        }

        const { data, error } = await supabase
            .from("project_files")
            .select("path, content")
            .eq("user_id", uid)
            .eq("chat_id", chat_id)
            .order("path", { ascending: true })

        if (error) {
            setError(error.message || "Could not load project files")
            return null
        }
        if (!data || data.length === 0) {
            setError("The build finished but no project files were found for this chat")
            return null
        }

        const next = { folder_name: folder_name || "expo-app", files: data }
        setProject(next)
        return next
    } catch (e) {
        setError(e.message || "Could not load project files")
        return null
    }
}
    useEffect(() => {
        loadDetails()
    }, [user_id, chat_id])

    useEffect(() => {
        if (!loading && !user) router.replace("/auth")
    }, [loading, user, router])

    useEffect(() => {
        bottom_ref.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, sending, progress.files.length])

    useEffect(() => {
        setVisited((v) => (v[tab] ? v : { ...v, [tab]: true }))
    }, [tab])

    useEffect(() => {
        if (!user_id) return
        supabase
            .from("project_settings")
            .select("supabase_url, supabase_anon_key")
            .eq("chat_id", chat_id)
            .maybeSingle()
            .then(({ data, error }) => {
                if (error) console.log("project_settings load failed:", error.message)
                else if (data) setKeys(data)
            })
    }, [user_id, chat_id])

    const preview_files = useMemo(
        () => (project ? injectKeys(project.files, keys) : []),
        [project, keys]
    )

    useEffect(() => {
        if (loading || !has_session) return

        const init = async () => {
            const { data, error: load_err } = await supabase
                .from("conversations")
                .select("role, message, images")
                .eq("chat_id", chat_id)
                .order("created_at", { ascending: true })

            if (load_err) {
                setError(load_err.message)
                return
            }

            if (data && data.length > 0) {
                const rows = data.map(normalizeRow)
                setMessages(rows)
                const last_code = [...rows].reverse().find((r) => r.type === "code")
                if (last_code) loadProject(last_code.folder_name)
                sessionStorage.removeItem(`pending:${chat_id}`)
                return
            }

            if (started_chats.has(chat_id)) return

            const pending = sessionStorage.getItem(`pending:${chat_id}`)
            if (pending) {
                started_chats.add(chat_id)
                sessionStorage.removeItem(`pending:${chat_id}`)
                const { message, images: pending_images } = parsePending(pending)
                await sendMessage(message, pending_images)
            }
        }

        init()
    }, [loading, has_session, chat_id])

    const handlePickImages = async (e) => {
        const picked = Array.from(e.target.files || []).slice(0, MAX_IMAGES - images.length)
        e.target.value = ""
        if (picked.length === 0) return

        setError("")
        try {
            const urls = await Promise.all(picked.map((f) => fileToResizedDataUrl(f)))
            setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES))
        } catch (err) {
            setError(err.message || "Could not read the image")
        }
    }

    const handleSend = () => {
        const text = input.trim()
        if (!text || sending) return
        const attached = images
        setInput("")
        setImages([])
        sendMessage(text, attached)
    }

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const openProject = async (m) => {
        setTab("files")
        setOpen_panel(true)
        await loadProject(m.folder_name)
    }

    const authHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        }
    }

    const loadEnv = async () => {
        try {
            const res = await fetch(apiUrl(`/api/env?chat_id=${chat_id}`), { headers: await authHeaders() })
            const data = await res.json()
            if (!res.ok) return
            const saved_keys = data.keys || []
            setEnv_saved(saved_keys)
            setEnv_rows(saved_keys.map((key) => ({ key, value: "", existing: true })))
        } catch {}
    }

    useEffect(() => {
        if (user_id && isBackend) loadEnv()
    }, [user_id, chat_id, isBackend])

    const updateEnvRow = (index, patch) =>
        setEnv_rows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

    const addEnvRow = () =>
        setEnv_rows((prev) => [...prev, { key: "", value: "", existing: false }])

    const removeEnvRow = (index) =>
        setEnv_rows((prev) => prev.filter((_, i) => i !== index))

    const addSuggestedEnv = () =>
        setEnv_rows((prev) => [
            ...prev,
            ...missing_env_keys.map((key) => ({ key, value: "", existing: false })),
        ])

    const saveEnv = async () => {
        const vars = {}
        for (const row of env_rows) {
            const key = row.key.trim().toUpperCase()
            if (key) vars[key] = row.value
        }
        const remove = env_saved.filter(
            (key) => !env_rows.some((row) => row.key.trim().toUpperCase() === key)
        )

        const res = await fetch(apiUrl("/api/env"), {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({ chat_id, vars, remove }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || "Failed to save variables")

        setEnv_saved(data.keys)
        setEnv_rows(data.keys.map((key) => ({ key, value: "", existing: true })))
    }

    const runDeploy = async () => {
        const res = await fetch(apiUrl("/api/deploy_render"), {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({ chat_id: details?.id || chat_id }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.message || "Failed to deploy")
        loadDetails()
        return result
    }

    const handleSaveEnv = async () => {
        if (env_busy) return
        setEnv_busy(true)
        setEnv_status({ text: "Saving...", kind: "note" })
        try {
            await saveEnv()
            setEnv_status({ text: "Variables saved", kind: "ok" })
        } catch (e) {
            setEnv_status({ text: e.message || "Failed to save variables", kind: "error" })
        } finally {
            setEnv_busy(false)
        }
    }

    const handleSaveAndDeploy = async () => {
        if (env_busy || !details?.repo_url) return
        setEnv_busy(true)
        setEnv_status({ text: "Saving...", kind: "note" })
        try {
            await saveEnv()
            setEnv_status({ text: "Deploying...", kind: "note" })
            const result = await runDeploy()
            setEnv_status({
                text: result.url ? `Deployed: ${result.url}` : "Redeploy started",
                kind: "ok",
            })
        } catch (e) {
            setEnv_status({ text: e.message || "Failed to deploy", kind: "error" })
        } finally {
            setEnv_busy(false)
        }
    }

    const deploy_render = async () => {
        if (!details?.repo_url || env_busy) return
        setTab("env")
        setOpen_panel(true)
        setEnv_busy(true)
        setEnv_status({ text: "Deploying...", kind: "note" })
        try {
            const result = await runDeploy()
            setEnv_status({
                text: result.url ? `Deployed: ${result.url}` : "Redeploy started",
                kind: "ok",
            })
        } catch (e) {
            setEnv_status({ text: e.message || "Failed to deploy", kind: "error" })
        } finally {
            setEnv_busy(false)
        }
    }

    const Fetch_commits = async () => {
        if (!user) return
        setTab("history")
        setOpen_panel(true)
        setCommits_state({ loading: true, error: "" })

        try {
            const res = await fetch(apiUrl(`/api/github/${user.id}/${details?.id || chat_id}`), {
                method: "GET",
            })
            const data = await res.json().catch(() => null)

            if (!res.ok) {
                setCommits([])
                setCommits_state({
                    loading: false,
                    error: details?.repo_url ? data?.error || "Failed to load commits" : "",
                })
                return
            }

            const list = Array.isArray(data) ? data : data?.commits || []
            setCommits(list.map(normalizeCommit))
            setCommits_state({ loading: false, error: "" })
        } catch (e) {
            setCommits([])
            setCommits_state({
                loading: false,
                error: details?.repo_url ? e.message || "Failed to load commits" : "",
            })
        }
    }

    const approveMigration = async (index, sql, confirm_destructive = false) => {
        setMigration_state((prev) => ({ ...prev, [index]: { status: "running", error: "" } }))
        try {
            const res = await fetch(apiUrl("/api/supabase/approve"), {
                method: "POST",
                headers: await authHeaders(),
                body: JSON.stringify({ sql, confirm_destructive }),
            })
            const data = await res.json()

            if (res.status === 409 && data.destructive && !confirm_destructive) {
                const confirmed = window.confirm(
                    "This migration drops, truncates or deletes data and cannot be undone. Run it anyway?"
                )
                if (confirmed) return approveMigration(index, sql, true)
                setMigration_state((prev) => ({ ...prev, [index]: { status: "pending", error: "" } }))
                return
            }

            if (!res.ok) {
                setMigration_state((prev) => ({
                    ...prev,
                    [index]: {
                        status: "error",
                        error: data.reason || data.error || "Migration failed",
                    },
                }))
                return
            }

            setMigration_state((prev) => ({ ...prev, [index]: { status: "executed", error: "" } }))
        } catch (e) {
            setMigration_state((prev) => ({
                ...prev,
                [index]: { status: "error", error: e.message || "Migration failed" },
            }))
        }
    }

    const rejectMigration = (index) => {
        setMigration_state((prev) => ({ ...prev, [index]: { status: "rejected", error: "" } }))
    }

    const stopApkPolling = () => {
        if (apk_timer.current) {
            clearInterval(apk_timer.current)
            apk_timer.current = null
        }
    }

    const checkApk = async (started_at) => {
        try {
            const res = await fetch(apiUrl(`/api/apk?chat_id=${chat_id}`), { headers: await authHeaders() })
            const result = await res.json()

            if (!res.ok) {
                stopApkPolling()
                setApk({ phase: "failed", run_url: "", error: result.error || "Could not check the build" })
                return "error"
            }

            if (result.status === "none") return "waiting"

            if (started_at && new Date(result.created_at).getTime() < started_at - 15000) return "waiting"

            if (result.status !== "completed") {
                setApk({ phase: "building", run_url: result.run_url, error: "" })
                return "building"
            }

            stopApkPolling()

            if (result.conclusion === "success" && result.asset) {
                setApk({ phase: "ready", run_url: result.run_url, error: "" })
                return "done"
            }

            setApk({
                phase: "failed",
                run_url: result.run_url,
                error: result.conclusion === "success" ? "The build finished but no APK was found" : "The build failed",
            })
            return "done"
        } catch (e) {
            stopApkPolling()
            setApk({ phase: "failed", run_url: "", error: e.message || "Could not check the build" })
            return "error"
        }
    }

    const startApkBuild = async () => {
        stopApkPolling()
        const started_at = Date.now()
        setApk({ phase: "starting", run_url: "", error: "" })

        try {
            const res = await fetch(apiUrl("/api/apk"), {
                method: "POST",
                headers: await authHeaders(),
                body: JSON.stringify({ chat_id }),
            })
            const result = await res.json()

            if (res.status === 409) {
                setApk({ phase: "building", run_url: "", error: "" })
                apk_timer.current = setInterval(() => checkApk(0), 8000)
                return
            }

            if (!res.ok) {
                setApk({ phase: "failed", run_url: "", error: result.error || "Could not start the build" })
                return
            }

            setApk({ phase: "building", run_url: "", error: "" })
            apk_timer.current = setInterval(() => checkApk(started_at), 8000)
        } catch (e) {
            setApk({ phase: "failed", run_url: "", error: e.message || "Could not start the build" })
        }
    }

    const downloadApk = async () => {
        try {
            const res = await fetch(apiUrl(`/api/apk?chat_id=${chat_id}&download=1`), { headers: await authHeaders() })
            const result = await res.json()
            if (!res.ok || !result.url) {
                setApk((a) => ({ ...a, error: result.error || "Could not get the download link" }))
                return
            }
            window.location.href = result.url
        } catch (e) {
            setApk((a) => ({ ...a, error: e.message || "Could not get the download link" }))
        }
    }

    useEffect(() => {
        return () => stopApkPolling()
    }, [])

    useEffect(() => {
        if (!details?.repo_url) return
        checkApk(0).then((state) => {
            if (state === "building" && !apk_timer.current) {
                apk_timer.current = setInterval(() => checkApk(0), 8000)
            }
        })
    }, [details?.repo_url])

    const Render_upload_key = async () => {
        if (render_key.trim().length < 5) return

        const response = await fetch(apiUrl("/api/render"), {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({ api_key: render_key }),
        })

        const result = await response.json()

        if (!response.ok) {
            console.log(result.error)
            return alert("failed to add key")
        }

        return alert("key added successfully")
    }

    const sendMessage = async (text, imgs = []) => {
        setError("")
        setSending(true)
        setProgress({ status: imgs.length > 0 ? "Uploading images" : "Starting", files: [], chars: 0 })

        let image_urls = []
        try {
            image_urls = await uploadImages(user.id, chat_id, imgs)
        } catch (e) {
            setError(e.message || "Could not upload the images")
            setInput(text)
            setImages(imgs)
            setSending(false)
            return
        }

        setProgress({ status: "Starting", files: [], chars: 0 })
        setMessages((prev) => [...prev, { role: "human", type: "chat", message: text, images: image_urls }])

        const controller = new AbortController()
        abort_ref.current = controller

        try {
            const { data: { session: fresh } } = await supabase.auth.getSession()

            const data = await streamChat({
                token: fresh.access_token,
                user_message: text,
                images: image_urls,
                chat_id,
                signal: controller.signal,
                onEvent: (e) => {
                    if (e.type === "status") setProgress((p) => ({ ...p, status: e.text }))
                    else if (e.type === "file") setProgress((p) => ({ ...p, files: [...p.files, e.path] }))
                    else if (e.type === "progress") setProgress((p) => ({ ...p, chars: e.chars }))
                    else if (e.type === "reset") setProgress((p) => ({ ...p, files: [], chars: 0 }))
                },
            })

            const reply = normalizeRow({ role: "ai", message: JSON.stringify(data.response)})
            setError_details(data.error_details)
            setMessages((prev) => [...prev, reply])
            loadDetails()

            if (reply.type === "code") {
                if (Array.isArray(data.project_files) && data.project_files.length > 0) {
                    setProject({ folder_name: reply.folder_name || "expo-app", files: data.project_files })
                    setTab("files")
                    setOpen_panel(true)
                } else {
                    const loaded = await loadProject(reply.folder_name)
                    if (loaded) {
                        setTab("files")
                        setOpen_panel(true)
                    }
                }
            }
        } catch (e) {
            setError(e.name === "AbortError" ? "Stopped" : e.message || "Something went wrong")
        } finally {
            setSending(false)
            abort_ref.current = null
        }
    }

    const fixBugs = () => {
        if (sending || !has_errors) return
        const list = error_details
            .slice(0, 10)
            .map((d) => `${d.path || "unknown"}${d.line ? `:${d.line}` : ""} ${d.message}`)
            .join("\n")
        sendMessage(`Fix these code errors:\n${list}`)
    }

    if (loading || !user) return null

    const delete_key = async () => {
        if (!user) return

        const { error } = await supabase
            .from("user_api_keys")
            .update({ encrypted_render_key: null })
            .eq("user_id", user.id)
            .select()
            .maybeSingle()

        if (error) {
            console.log(error)
            return alert("could not delete api key")
        }

        return alert("api key deleted successfully")
    }

    const has_repo = !!details?.repo_url

    const panel_tabs = [
        { id: "files", label: "Files", icon: <CodeXml size={15} strokeWidth={1.6} /> },
        { id: "preview", label: "Preview", icon: <MonitorSmartphone size={15} strokeWidth={1.6} /> },
        { id: "supabase", label: "Supabase", icon: <img src={db.src} width={15} height={15} alt="" /> },
        ...(isBackend
            ? [{ id: "env", label: "Env", icon: <Braces size={15} strokeWidth={1.6} /> }]
            : []),
        { id: "history", label: "History", icon: <GitBranch size={15} strokeWidth={1.6} /> },
    ]
    const current_tab = panel_tabs.find((t) => t.id === tab)
    const apk_label =
        apk.phase === "ready"
            ? "APK ready"
            : apk.phase === "building" || apk.phase === "starting"
              ? "APK building"
              : apk.phase === "failed"
                ? "APK failed"
                : "No APK"
    const apk_dot =
        apk.phase === "ready"
            ? styles.sb_dot_ok
            : apk.phase === "failed"
              ? styles.sb_dot_err
              : apk.phase === "building" || apk.phase === "starting"
                ? styles.sb_dot_warn
                : ""

    return (
        <div className={styles.bg}>
            <div className={styles.wrapper}>
                <div className={styles.nav}>
                    <div className={styles.left_side}>
                        <button className={styles.back_btn} onClick={() => window.location.href = '/dashboard'} aria-label="Back to dashboard">
                            <ArrowLeft size={18} />
                        </button>
                        <img src={logo.src} className={styles.nav_logo} alt="Lunaar" />
                        <span className={styles.crumb_sep}>/</span>
                        <span className={styles.crumb_title}>
                            {details?.title || first_message.slice(0, 40) || "New chat"}
                        </span>
                    </div>
                    <div className={styles.right_side}>
                        <button className={styles.nav_btn} onClick={Fetch_commits}>
                            <GitBranch size={15} />
                            <span>History</span>
                        </button>
                    </div>
                </div>

                <div className={styles.scroll}>
                    <div className={styles.messages}>
                        {messages.map((m, i) => {
                            const migration = migration_state[i] || { status: "pending", error: "" }
                            const has_pending = typeof m.pending_sql === "string" && m.pending_sql.trim().length > 0
                            const is_human = m.role === "human"

                            return (
                                <div key={i} className={`${styles.row} ${is_human ? styles.row_human : styles.row_ai}`}>
                                    {!is_human && <img src={logo.src} className={styles.avatar} alt="" />}
                                    <div className={`${styles.bubble} ${is_human ? styles.human : styles.ai}`}>
                                        {m.images?.length > 0 && (
                                            <div className={styles.msg_images}>
                                                {m.images.map((src, k) => (
                                                    <img key={k} src={src} alt="" className={styles.msg_img} />
                                                ))}
                                            </div>
                                        )}

                                        {m.message}

                                        {has_pending && (
                                            <div className={styles.pending_url_wrapper}>
                                                <CodeBlock block={{ label: "Migration", language: "sql", code: m.pending_sql }} />

                                                {(migration.status === "pending" || migration.status === "error") && (
                                                    <div className={styles.migration_actions}>
                                                        <button className={styles.Approve_btn} onClick={() => approveMigration(i, m.pending_sql)}>
                                                            Approve
                                                        </button>
                                                        <button className={styles.Reject_btn} onClick={() => rejectMigration(i)}>
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}

                                                {migration.status === "running" && <p className={styles.note}>Running migration...</p>}
                                                {migration.status === "executed" && <p className={styles.note}>Migration applied.</p>}
                                                {migration.status === "rejected" && <p className={styles.note}>Migration rejected.</p>}
                                                {migration.status === "error" && !!migration.error && (
                                                    <p className={styles.error}>{migration.error}</p>
                                                )}
                                            </div>
                                        )}

                                        {m.type === "code" && (
                                            <button className={styles.editor_open} onClick={() => openProject(m)}>
                                                <FolderCode size={18} className={styles.editor_icon} />
                                                <span className={styles.editor_name}>{m.folder_name || "expo-app"}/</span>
                                                <span className={styles.editor_meta}>
                                                    {m.changed_paths?.length || m.files?.length || 0} files changed
                                                </span>
                                            </button>
                                        )}

                                        {m.type === "block_code" &&
                                            m.blocks?.map((block, j) => <CodeBlock key={j} block={block} />)}
                                    </div>
                                </div>
                            )
                        })}

                        {sending && (
                            <div className={`${styles.row} ${styles.row_ai}`}>
                                <img src={logo.src} className={`${styles.avatar} ${styles.avatar_busy}`} alt="" />
                                <div className={`${styles.bubble} ${styles.ai} ${styles.working}`}>
                                    <div className={styles.working_head}>
                                        <span className={styles.working_dot} />
                                        <span>{progress.status || note || "Working"}...</span>
                                    </div>
                                    {progress.files.slice(-6).map((path) => (
                                        <div key={path} className={styles.working_file}>
                                            Writing {path}
                                        </div>
                                    ))}
                                    {progress.chars > 0 && (
                                        <div className={styles.working_chars}>
                                            {(progress.chars / 1000).toFixed(1)}k characters
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {!!error && <p className={styles.error}>{error}</p>}
                        {apk.phase === "building" && (
                            <p className={styles.note}>
                                Building your APK on GitHub. This usually takes 5 to 15 minutes.
                            </p>
                        )}
                        {!!apk.error && (
                            <p className={styles.error}>
                                {apk.error}
                                {!!apk.run_url && (
                                    <>
                                        {" "}
                                        <a href={apk.run_url} target="_blank" rel="noreferrer" className={styles.error_link}>
                                            View logs
                                        </a>
                                    </>
                                )}
                            </p>
                        )}
                        <div ref={bottom_ref} />
                    </div>
                </div>

                <div className={styles.composer_dock}>
                    <div className={styles.composer}>
                        {images.length > 0 && (
                            <div className={styles.thumbs}>
                                {images.map((src, i) => (
                                    <div key={i} className={styles.thumb}>
                                        <img src={src} alt="" />
                                        <button
                                            onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                                            aria-label="Remove image"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <textarea
                            placeholder="Ask for a change or a new screen..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <div className={styles.composer_row}>
                            <div className={styles.composer_left}>
                                <input
                                    ref={file_ref}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    hidden
                                    onChange={handlePickImages}
                                />
                                <button
                                    className={styles.icon_btn}
                                    onClick={() => file_ref.current?.click()}
                                    disabled={images.length >= MAX_IMAGES}
                                    aria-label="Attach image"
                                    title="Attach image"
                                >
                                    <Plus size={18} />
                                </button>
                                <button
                                    className={styles.icon_btn}
                                    onClick={() => setRender_panel(true)}
                                    aria-label="Render API key"
                                    title="Render API key"
                                >
                                    <KeyRound size={16} />
                                </button>
                                <button
                                    className={styles.icon_btn}
                                    onClick={() => setOpen_panel(true)}
                                    aria-label="Open project panel"
                                    title="Open project panel"
                                >
                                    <AppWindow size={18} />
                                </button>
                            </div>
                            <button
                                onClick={sending ? () => abort_ref.current?.abort() : handleSend}
                                className={styles.send_btn}
                                disabled={!sending && !input.trim()}
                            >
                                {sending ? <Square size={13} /> : <ArrowUp size={16} />}
                                {sending ? "Stop" : "Build now"}
                            </button>
                        </div>
                    </div>
                </div>

                {render_panel && (
                    <div className={styles.render_panel_bg} onClick={() => setRender_panel(false)}>
                        <div
                            className={styles.render_panel}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-label="Render API key"
                        >
                            <div className={styles.r_p_nav}>
                                <h3>Render API key</h3>
                                <button onClick={() => setRender_panel(false)} aria-label="Close">
                                    <X size={18} />
                                </button>
                            </div>
                            <p className={styles.r_p_desc}>
                                Your key is encrypted before it is stored and is never sent to the model.
                            </p>
                            <div className={styles.input_r_p}>
                                <input
                                    type="password"
                                    value={render_key}
                                    onChange={(e) => setRender_key(e.target.value)}
                                    placeholder="rnd_xxxxxxxx"
                                />
                            </div>
                            <div className={styles.render_panel_btns}>
                                <button className={styles.panel_btn_danger} onClick={delete_key}>
                                    Delete key
                                </button>
                                <button className={styles.panel_btn_primary} onClick={Render_upload_key}>
                                    Save key
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {open_panel && <div className={styles.panel_scrim} onClick={() => setOpen_panel(false)} />}

                <div className={styles.panel} style={{ display: open_panel ? undefined : "none" }}>
                    <div className={styles.panel_nav}>
                        <div className={styles.tabs} role="tablist">
                            {panel_tabs.map((t) => (
                                <button
                                    key={t.id}
                                    role="tab"
                                    aria-selected={tab === t.id}
                                    className={`${styles.tab_btn} ${tab === t.id ? styles.tab_active : ""}`}
                                    onClick={t.id === "history" ? Fetch_commits : () => setTab(t.id)}
                                    title={t.label}
                                >
                                    {t.icon}
                                    <span className={styles.tab_label}>{t.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className={styles.right_btns}>
                            {!has_repo && (
                                <button
                                    className={styles.deploy_btn}
                                    disabled={sending}
                                    onClick={() =>
                                        sendMessage(
                                            "Create a repo for the code you have given and push files, name the according to context of app"
                                        )
                                    }
                                >
                                    <GitBranch size={14} />
                                    Create repo
                                </button>
                            )}

                            {isBackend && has_repo && (
                                <button className={styles.deploy_btn} onClick={deploy_render} disabled={env_busy}>
                                    <Server size={14} />
                                    Deploy backend
                                </button>
                            )}

                            {!has_repo && (
                                <button
                                    className={styles.deploy_btn}
                                    disabled
                                    title="Create a repo first"
                                    aria-label="Download APK (create a repo first)"
                                >
                                    <Download size={14} />
                                    Download APK
                                </button>
                            )}

                            {has_repo && apk.phase === "ready" && (
                                <>
                                    <button className={styles.deploy_btn} onClick={startApkBuild}>
                                        Rebuild
                                    </button>
                                    <button className={`${styles.deploy_btn} ${styles.deploy_primary}`} onClick={downloadApk}>
                                        <Download size={14} />
                                        Download APK
                                    </button>
                                </>
                            )}

                            {has_repo && apk.phase !== "ready" && (
                                <button
                                    className={styles.deploy_btn}
                                    disabled={apk.phase === "starting" || apk.phase === "building"}
                                    onClick={startApkBuild}
                                >
                                    <Download size={14} />
                                    {apk.phase === "starting"
                                        ? "Starting..."
                                        : apk.phase === "building"
                                          ? "Building APK..."
                                          : "Build APK"}
                                </button>
                            )}

                            {has_errors && (
                                <button className={styles.error_btn} onClick={fixBugs} disabled={sending}>
                                    <Wrench size={14} />
                                    Fix bugs
                                </button>
                            )}

                            <button onClick={() => setOpen_panel(false)} className={styles.close_btn} aria-label="Close panel">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.crumbs}>
                        <span className={styles.crumb_name}>{project?.folder_name || "expo-app"}</span>
                        <span className={styles.crumb_slash}>/</span>
                        <span className={styles.crumb_here}>{current_tab?.label.toLowerCase()}</span>
                    </div>

                    <div className={styles.panel_content}>
                        <div style={{ display: tab === "supabase" ? "block" : "none", height: "100%" }}>
                            <SupabaseSettings
                                chat_id={chat_id}
                                user_id={user.id}
                                keys={keys}
                                onSaved={setKeys}
                            />
                        </div>

                        {project && visited.files && (
                            <div style={{ display: tab === "files" ? "block" : "none", height: "100%" }}>
                                <FileSystem
                                    key={project.folder_name + project.files.length}
                                    folder_name={project.folder_name}
                                    files={project.files}
                                />
                            </div>
                        )}

                        {project && visited.preview && (
                            <div style={{ display: tab === "preview" ? "block" : "none", height: "100%" }}>
                                <SnackPreview
                                    key={project.folder_name}
                                    folder_name={project.folder_name}
                                    files={preview_files}
                                />
                            </div>
                        )}

                        {isBackend && visited.env && (
                            <div style={{ display: tab === "env" ? "block" : "none", height: "100%" }}>
                                <div className={styles.env_wrap}>
                                    <h3 className={styles.env_title}>Environment variables</h3>
                                    <p className={styles.env_desc}>
                                        These are sent to Render when you deploy. Values are encrypted before they are
                                        stored and are never shown again. Your Supabase URL and service key are added
                                        automatically.
                                    </p>

                                    {missing_env_keys.length > 0 && (
                                        <button className={styles.env_suggest} onClick={addSuggestedEnv}>
                                            <Plus size={14} />
                                            Add {missing_env_keys.length} from .env.example
                                        </button>
                                    )}

                                    <div className={styles.env_rows}>
                                        {env_rows.length === 0 && (
                                            <div className={styles.env_empty}>No variables yet</div>
                                        )}
                                        {env_rows.map((row, index) => (
                                            <div key={index} className={styles.env_row}>
                                                <input
                                                    className={`${styles.env_input} ${styles.env_key}`}
                                                    placeholder="KEY"
                                                    value={row.key}
                                                    disabled={row.existing}
                                                    spellCheck={false}
                                                    autoCapitalize="characters"
                                                    onChange={(e) => updateEnvRow(index, { key: e.target.value })}
                                                />
                                                <input
                                                    className={`${styles.env_input} ${styles.env_value}`}
                                                    type="password"
                                                    autoComplete="off"
                                                    placeholder={row.existing ? "Saved. Type to replace" : "Value"}
                                                    value={row.value}
                                                    onChange={(e) => updateEnvRow(index, { value: e.target.value })}
                                                />
                                                <button
                                                    className={styles.env_remove}
                                                    onClick={() => removeEnvRow(index)}
                                                    aria-label="Remove variable"
                                                    title="Remove variable"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className={styles.env_actions}>
                                        <button className={styles.env_btn} onClick={addEnvRow} disabled={env_busy}>
                                            <Plus size={14} />
                                            Add variable
                                        </button>
                                        <button className={styles.env_btn} onClick={handleSaveEnv} disabled={env_busy}>
                                            Save
                                        </button>
                                        <button
                                            className={`${styles.env_btn} ${styles.env_btn_primary}`}
                                            onClick={handleSaveAndDeploy}
                                            disabled={env_busy || !has_repo}
                                        >
                                            <Server size={14} />
                                            Save and deploy
                                        </button>
                                    </div>

                                    {!has_repo && (
                                        <p className={styles.env_hint}>Create a repo first to enable deploying.</p>
                                    )}

                                    {!!env_status.text && (
                                        <p
                                            className={`${styles.env_status} ${
                                                env_status.kind === "error"
                                                    ? styles.env_status_error
                                                    : env_status.kind === "ok"
                                                      ? styles.env_status_ok
                                                      : ""
                                            }`}
                                        >
                                            {env_status.text}
                                        </p>
                                    )}

                                    {!!details?.render_url && (
                                        <a
                                            href={details.render_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={styles.env_link}
                                        >
                                            {details.render_url}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === "history" && (
                            <div className={styles.history_wrap}>
                                {commits_state.loading && (
                                    <div className={styles.history_note}>Loading commits...</div>
                                )}
                                {!commits_state.loading && !!commits_state.error && (
                                    <div className={styles.history_note}>{commits_state.error}</div>
                                )}
                                {!commits_state.loading && !commits_state.error && commits.length === 0 && (
                                    <div className={styles.history_note}>
                                        No commits to return, please create a repo first
                                    </div>
                                )}
                                {!commits_state.loading && commits.length > 0 && <CommitTree commits={commits} />}
                            </div>
                        )}
                        {tab !== "supabase" && tab !== "history" && tab !== "env" && !project && (
                            <div className={styles.preview_empty}>No app built yet</div>
                        )}
                    </div>

                    <div className={styles.statusbar}>
                        <div className={styles.status_group}>
                            <span className={styles.status_item}>
                                <span className={`${styles.sb_dot} ${has_errors ? styles.sb_dot_err : styles.sb_dot_ok}`} />
                                {has_errors
                                    ? `${error_details.length} issue${error_details.length > 1 ? "s" : ""}`
                                    : "No issues"}
                            </span>
                            <span className={`${styles.status_item} ${styles.status_hide_sm}`}>
                                {project?.files?.length || 0} files
                            </span>
                        </div>
                        <div className={styles.status_group}>
                            <span className={styles.status_item}>
                                <span className={`${styles.sb_dot} ${apk_dot}`} />
                                {apk_label}
                            </span>
                            <span className={`${styles.status_item} ${styles.status_hide_sm}`}>
                                <GitBranch size={11} />
                                {has_repo ? "main" : "no repo"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
