"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "../../auth/AuthContext"
import supabase from "../../utils/supabase_browser"
import FileSystem from "../../components/FileSystem"
import SnackPreview from "../../components/SnackPreview"
import SupabaseSettings from "../../components/SupabaseSettings"
import { injectKeys } from "../../utils/injectKeys"
import styles from "../chat.module.css"
import { MoveLeft, Folder, MonitorSmartphone, Database, X, ArrowUp, Copy, Check, Plus, Square, GitBranch } from "lucide-react"
import { streamChat } from "../../api/chat/streamChat"

const started_chats = new Set()

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
        return { role: "human", type: "chat", message: String(row.message ?? "") }
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
            }
        }
    } catch {}
    return { role: "ai", type: "chat", message: String(row.message ?? ""), files: [], blocks: [] }
}

function toProject(m) {
    return { folder_name: m.folder_name || "expo-app", files: m.files }
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
        <div
            style={{
                marginTop: 10,
                background: "#0a0a0a",
                border: "1px solid #ebe6e6",
                borderRadius: 8,
                overflow: "hidden",
                textAlign: "left",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f1f1f",
                    fontSize: 12,
                    color: "#a1a1a1",
                }}
            >
                <span>
                    {block.label}
                    {block.language ? ` · ${block.language}` : ""}
                </span>
                <button
                    onClick={copy}
                    aria-label="Copy code"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "transparent",
                        border: "none",
                        color: copied ? "#fff" : "#a1a1a1",
                        fontSize: 12,
                        cursor: "pointer",
                        padding: 0,
                    }}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre
                style={{
                    margin: 0,
                    padding: 12,
                    overflowX: "auto",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "#e7e4e4",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    whiteSpace: "pre",
                }}
            >
                <code>{block.code}</code>
            </pre>
        </div>
    )
}

export default function ChatClient() {
    const router = useRouter()
    const { id: chat_id } = useParams()
    const { user, session, loading } = useAuth()
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState("")
    const [sending, setSending] = useState(false)
    const [error, setError] = useState("")
    const [project, setProject] = useState(null)
    const [keys, setKeys] = useState(null)
    const [open_panel, setOpen_panel] = useState(false)
    const [tab, setTab] = useState("files")
    const bottom_ref = useRef(null)
    const [details, setDetails] = useState(null)
    const [render_panel, setRender_panel] = useState(false)
    const note = useProgressNote(sending)
    const [render_key, setRender_key] = useState("")
    const [history, setHistory] = useState({ commits: [], loading: false, error: "" })

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
            const res = await fetch(`/api/project?chat_id=${chat_id}`, {
                headers: { Authorization: `Bearer ${fresh.access_token}` },
            })
            const result = await res.json()

            if (!res.ok) {
                setError(result.error || "Could not load project files")
                return null
            }
            if (!result.files || result.files.length === 0) {
                setError("The build finished but no project files were found for this chat")
                return null
            }

            const next = { folder_name: folder_name || "expo-app", files: result.files }
            setProject(next)
            return next
        } catch (e) {
            setError(e.message || "Could not load project files")
            return null
        }
    }

    useEffect(() => {
        loadDetails()
    }, [user, chat_id])

    useEffect(() => {
        if (!loading && !user) router.replace("/auth")
    }, [loading, user, router])

    useEffect(() => {
        bottom_ref.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, sending])

    useEffect(() => {
        if (!user) return
        supabase
            .from("project_settings")
            .select("supabase_url, supabase_anon_key")
            .eq("chat_id", chat_id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) setKeys(data)
            })
    }, [user, chat_id])

    const preview_files = useMemo(
        () => (project ? injectKeys(project.files, keys) : []),
        [project, keys]
    )

    useEffect(() => {
        if (loading || !session) return

        const init = async () => {
            const { data, error: load_err } = await supabase
                .from("conversations")
                .select("role, message")
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
                await sendMessage(pending)
            }
        }

        init()
    }, [loading, session, chat_id])

    const handleSend = () => {
        const text = input.trim()
        if (!text || sending) return
        setInput("")
        sendMessage(text)
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

    const openSettings = () => {
        setTab("supabase")
        setOpen_panel(true)
    }

    const openHistory = async () => {
        setTab("history")
        setOpen_panel(true)
        setHistory((h) => ({ ...h, loading: true, error: "" }))
        try {
            const res = await fetch(`/api/github/commits?chat_id=${chat_id}`, {
                headers: await authHeaders(),
            })
            const result = await res.json()
            if (!res.ok) {
                setHistory({ commits: [], loading: false, error: result.error || "Failed to load history" })
                return
            }
            setHistory({ commits: result.commits, loading: false, error: "" })
        } catch (e) {
            setHistory({ commits: [], loading: false, error: e.message || "Failed to load history" })
        }
    }

    const authHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        }
    }

    const Render_upload_key = async () => {
        if (render_key.trim().length < 5) return

        const response = await fetch("/api/render", {
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

    const deploy_render = async () => {
        if (!details?.repo_url) return

        const res = await fetch("/api/deploy_render", {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({
                user_id: user.id,
                chat_id: details.id,
            }),
        })

        const result = await res.json()
        if (!res.ok) {
            return alert("failed to deploy")
        }

        return alert("deployed successfully")
    }

    const sendMessage = async (text) => {
        setError("")
        setSending(true)
        setProgress({ status: "Starting", files: [], chars: 0 })
        setMessages((prev) => [...prev, { role: "human", type: "chat", message: text }])

        const controller = new AbortController()
        abort_ref.current = controller

        try {
            const { data: { session: fresh } } = await supabase.auth.getSession()

            const data = await streamChat({
                token: fresh.access_token,
                user_message: text,
                chat_id,
                signal: controller.signal,
                onEvent: (e) => {
                    if (e.type === "status") setProgress((p) => ({ ...p, status: e.text }))
                    else if (e.type === "file") setProgress((p) => ({ ...p, files: [...p.files, e.path] }))
                    else if (e.type === "progress") setProgress((p) => ({ ...p, chars: e.chars }))
                    else if (e.type === "reset") setProgress((p) => ({ ...p, files: [], chars: 0 }))
                },
            })

            const reply = normalizeRow({ role: "ai", message: JSON.stringify(data.response) })
            setMessages((prev) => [...prev, reply])

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

    if (loading || !user) return null

    return (
        <div className={styles.wrapper}>
            <div className={styles.nav}>
                <div className={styles.left_side}>
                    <button onClick={() => router.push("/dashboard")} aria-label="Back">
                        <MoveLeft color="#ccc" />
                    </button>
                    <h2>/</h2> <span>{first_message.slice(0, 40) || "New Chat"}</span>
                </div>
                <div className={styles.right_side}>
                    <button className={styles.nav_btn} onClick={openHistory}>
                        <GitBranch size={16} strokeWidth={1.4} />
                        <span>Git History</span>
                    </button>
                    <button className={styles.nav_btn} onClick={openSettings}>
                        <Database size={16} strokeWidth={1.4} />
                        <span>Supabase{keys ? " (connected)" : ""}</span>
                    </button>
                </div>
            </div>

            <div className={styles.messages}>
                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`${styles.bubble} ${m.role === "human" ? styles.human : styles.ai}`}
                    >
                        {m.message}

                        {m.type === "code" && (
                            <div className={styles.editor_open} onClick={() => openProject(m)}>
                                {m.folder_name || "expo-app"}/ ({m.changed_paths?.length || m.files?.length || 0} files changed)
                            </div>
                        )}

                        {m.type === "block_code" &&
                            m.blocks?.map((block, j) => <CodeBlock key={j} block={block} />)}
                    </div>
                ))}

                {sending && (
                    <div className={`${styles.bubble} ${styles.ai}`}>
                        <div>{progress.status || "Working"}...</div>
                        {progress.files.slice(-6).map((path) => (
                            <div key={path} style={{ fontSize: 12, color: "#a1a1a1" }}>
                                Writing {path}
                            </div>
                        ))}
                        {progress.chars > 0 && (
                            <div style={{ fontSize: 12, color: "#666" }}>
                                {(progress.chars / 1000).toFixed(1)}k characters
                            </div>
                        )}
                    </div>
                )}
                {!!error && <p className={styles.error}>{error}</p>}
                <div ref={bottom_ref} />
            </div>

            <div className={styles.composer}>
                <textarea
                    placeholder="Message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className={styles.composer_row}>
                    <div className={styles.composer_left}>
                        <button className={styles.normal_btn}>
                            <Plus size={18} />
                        </button>
                        <button className={styles.render_btn} onClick={() => setRender_panel(true)}>
                            Render
                        </button>
                    </div>
                    <button
                        onClick={sending ? () => abort_ref.current?.abort() : handleSend}
                        className={styles.send_btn}
                    >
                        {sending ? <Square size={14} /> : <ArrowUp size={16} />}
                        {sending ? "Stop" : "Build Now"}
                    </button>
                </div>
            </div>

            {render_panel && (
                <div className={styles.render_panel_bg}>
                    <div className={styles.render_panel}>
                        <div className={styles.r_p_nav}>
                            <h3>Add/Update Render</h3>
                            <button onClick={() => setRender_panel(false)}>X</button>
                        </div>
                        <div className={styles.input_r_p}>
                            <input
                                type="password"
                                value={render_key}
                                onChange={(e) => setRender_key(e.target.value)}
                                placeholder="********"
                            />
                            <button onClick={Render_upload_key}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {open_panel && (
                <div className={styles.panel}>
                    <div className={styles.panel_nav}>
                        <div className={styles.panel_btns}>
                            <button
                                className={`${styles.folder_btn} ${tab === "files" ? styles.tab_active : ""}`}
                                onClick={() => setTab("files")}
                            >
                                <Folder strokeWidth={1.2} /> Files
                            </button>
                            <button
                                className={`${styles.preview_btn} ${tab === "preview" ? styles.preview_active : ""}`}
                                onClick={() => setTab("preview")}
                            >
                                <MonitorSmartphone /> Preview
                            </button>
                            <button
                                className={`${styles.folder_btn} ${tab === "supabase" ? styles.tab_active : ""}`}
                                onClick={() => setTab("supabase")}
                            >
                                <Database strokeWidth={1.2} /> Supabase
                            </button>
                            <button
                                className={`${styles.folder_btn} ${tab === "history" ? styles.tab_active : ""}`}
                                onClick={openHistory}
                            >
                                <GitBranch strokeWidth={1.2} /> History
                            </button>
                        </div>
                        <div className={styles.right_btns}>
                            {!details?.repo_url && (
                                <button
                                    className={styles.deploy_btn}
                                    disabled={sending}
                                    onClick={() =>
                                        sendMessage(
                                            "Create a repo for the code you have given and push files, repo name Lunaar_app"
                                        )
                                    }
                                >
                                    Create Repo
                                </button>
                            )}

                            {isBackend && !!details?.repo_url && (
                                <button className={styles.deploy_btn} onClick={deploy_render}>
                                    Deploy Backend
                                </button>
                            )}

                            <button onClick={() => setOpen_panel(false)} className={styles.close_btn}>
                                <X />
                            </button>
                        </div>
                    </div>

                    <div className={styles.panel_content}>
                        {tab === "supabase" && (
                            <SupabaseSettings
                                chat_id={chat_id}
                                user_id={user.id}
                                keys={keys}
                                onSaved={setKeys}
                            />
                        )}
                        {tab === "files" && project && (
                            <FileSystem
                                key={project.folder_name + project.files.length}
                                folder_name={project.folder_name}
                                files={project.files}
                            />
                        )}
                        {tab === "preview" && project && (
                            <SnackPreview
                                key={project.folder_name + project.files.length + (keys?.supabase_url || "")}
                                folder_name={project.folder_name}
                                files={preview_files}
                            />
                        )}
                        {tab === "history" && (
                            <div className={styles.history_wrap}>
                                {history.loading && <div className={styles.history_note}>Loading commits...</div>}
                                {!history.loading && !!history.error && (
                                    <div className={styles.history_note}>{history.error}</div>
                                )}
                                {!history.loading && !history.error && history.commits.length === 0 && (
                                    <div className={styles.history_note}>No commits yet</div>
                                )}
                                {history.commits.map((c) => (
                                    <a
                                        key={c.sha}
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.commit_item}
                                    >
                                        <span className={styles.commit_msg}>{c.message}</span>
                                        <span className={styles.commit_meta}>
                                            {c.sha.slice(0, 7)} · {c.author} · {new Date(c.date).toLocaleString()}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        )}
                        {tab !== "supabase" && tab !== "history" && !project && (
                            <div className={styles.preview_empty}>No app built yet</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}