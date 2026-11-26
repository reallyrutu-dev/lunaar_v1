"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import SupabaseProjectSelector from "../components/selector"
import { useRouter, usePathname } from "next/navigation"
import {
    CircleUserRound,
    Plus,
    X,
    SquarePen,
    Settings,
    Menu,
    ListTodo,
    CloudSun,
    Ticket,
    GraduationCap,
    ArrowUp,
    Coins,
    PanelLeftClose,
    PanelLeftOpen,
    ChevronsUpDown,
    Zap
} from "lucide-react"
import styles from "./dashboard.module.css"
import { useAuth } from "../auth/AuthContext"
import supabase from "../utils/supabase_browser"
import { fileToResizedDataUrl } from "../utils/ImageUtils.js"
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import logo from "../../public/logo.png"

// Base URL for every backend call. Set NEXT_PUBLIC_BACKEND_URL in .env.local
// (no trailing slash needed). If it is empty, calls go to the same origin.
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
const apiUrl = (path) => `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`

const queryClient = new QueryClient()

const MAX_IMAGES = 4

const GITHUB_MESSAGES = {
    scope: "GitHub connected without the workflow permission. Click Reconnect and approve all requested permissions.",
    failed: "Could not connect GitHub. Please try again.",
    invalid: "The GitHub connection expired. Please try again.",
}

const default_links = [
    { label: "New app", href: "/dashboard", icon: SquarePen },
    { label: "Profile", href: "/profile", icon: CircleUserRound },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Plan", href: "/subscription", icon: Coins },
]

const UPGRADE_PLANS = [
    { name: "Vibe", price: 199, usd: "2.14", tokens: 3, apps: "50+" },
    { name: "Max", price: 499, usd: "5.37", tokens: 10, apps: "200" },
    { name: "Studio", price: 999, usd: "10.76", tokens: 25, apps: "500" },
]

const prompt_cards = [
    {
        label: "to do list",
        icon: ListTodo,
        text: "make a simple to do list app",
    },
    {
        label: "weather app",
        icon: CloudSun,
        text: "create a weather app which shows weather across cities add a search bar to search for an city",
    },
    {
        label: "bus ticket",
        icon: Ticket,
        text: "make a bus booking platfrom, make the ui modern and don't just blust gradient here and their",
    },
    {
        label: "study app",
        icon: GraduationCap,
        text: "create a study app which will help decrease screen time of students,make it able to lock apps which a student selects",
    },
]

const fetchConversations = async (user_id) => {
    if (!user_id) return []

    const { data, error } = await supabase
        .from("chats")
        .select("id, title, created_at")
        .order("created_at", { ascending: false })

    if (error) {
        throw new Error(error.message)
    }

    return data || []
}

const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
    }
}

const connectGithub = async () => {
    const res = await fetch(apiUrl("/api/github/connect"), { headers: await authHeaders() })
    const data = await res.json()
    if (!res.ok || !data.url) throw new Error(data.error || "Could not start the GitHub connection.")
    window.location.href = data.url
}

const createRepo = async (name, description, isPrivate = true) => {
    const res = await fetch(apiUrl("/api/github/repos"), {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name, description, isPrivate }),
    })
    return res.json()
}

const pushFiles = async (repo, files, message, branch = "main") => {
    const res = await fetch(apiUrl("/api/github/commit"), {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ repo, files, message, branch }),
    })
    return res.json()
}

function GithubIcon({ size = 18 }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
            <path fill="currentColor" d="M208.31 75.68A59.78 59.78 0 0 0 202.93 28a8 8 0 0 0-6.93-4a59.75 59.75 0 0 0-48 24h-24a59.75 59.75 0 0 0-48-24a8 8 0 0 0-6.93 4a59.78 59.78 0 0 0-5.38 47.68A58.14 58.14 0 0 0 56 104v8a56.06 56.06 0 0 0 48.44 55.47A39.8 39.8 0 0 0 96 192v8H72a24 24 0 0 1-24-24a40 40 0 0 0-40-40a8 8 0 0 0 0 16a24 24 0 0 1 24 24a40 40 0 0 0 40 40h24v16a8 8 0 0 0 16 0v-40a24 24 0 0 1 48 0v40a8 8 0 0 0 16 0v-40a39.8 39.8 0 0 0-8.44-24.53A56.06 56.06 0 0 0 216 112v-8a58.14 58.14 0 0 0-7.69-28.32M200 112a40 40 0 0 1-40 40h-48a40 40 0 0 1-40-40v-8a41.74 41.74 0 0 1 6.9-22.48a8 8 0 0 0 1.1-7.69a43.8 43.8 0 0 1 .79-33.58a43.88 43.88 0 0 1 32.32 20.06a8 8 0 0 0 6.71 3.69h32.35a8 8 0 0 0 6.74-3.69a43.87 43.87 0 0 1 32.32-20.06a43.8 43.8 0 0 1 .77 33.58a8.09 8.09 0 0 0 1 7.65a41.7 41.7 0 0 1 7 22.52Z" />
        </svg>
    )
}

function SupabaseIcon({ size = 18 }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .724.229l9.075-12.476.401-.562a1.04 1.04 0 0 0-.836-1.66z" />
        </svg>
    )
}

function StatusValue({ checking, connected }) {
    const state = checking ? "checking" : connected ? "connected" : "disconnected"
    const label = checking ? "Checking" : connected ? "Connected" : "Not connected"

    return (
        <span className={`${styles.status_value} ${styles[`status_${state}`]}`} role="status">
            <span className={styles.status_dot} />
            {label}
        </span>
    )
}

function ConnectionPanel({
    title,
    icon,
    connected,
    checking,
    busy,
    description,
    error,
    onConnect,
    onDisconnect,
    onClose,
    children,
}) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <div className={styles.panel_backdrop} onClick={onClose}>
            <div
                className={styles.panel_card}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={title}
            >
                <div className={styles.panel_head}>
                    <span className={styles.panel_icon}>{icon}</span>
                    <h3 className={styles.panel_title}>{title}</h3>
                    <button className={styles.panel_close} onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <p className={styles.panel_desc}>{description}</p>

                <div className={styles.panel_row}>
                    <span className={styles.row_label}>Status</span>
                    <StatusValue checking={checking} connected={connected} />
                </div>

                {!!error && <p className={styles.panel_error}>{error}</p>}

                {children}

                <div className={styles.panel_actions}>
                    {connected && (
                        <button
                            className={`${styles.panel_btn} ${styles.panel_btn_danger}`}
                            onClick={onDisconnect}
                            disabled={busy || checking}
                        >
                            Disconnect
                        </button>
                    )}
                    <button
                        className={`${styles.panel_btn} ${connected ? "" : styles.panel_btn_primary}`}
                        onClick={onConnect}
                        disabled={busy || checking}
                    >
                        {connected ? "Reconnect" : "Connect"}
                    </button>
                </div>
            </div>
        </div>
    )
}

function UpgradePanel({ onUpgrade, onClose }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <div className={styles.panel_backdrop} onClick={onClose}>
            <div
                className={`${styles.panel_card} ${styles.upgrade_card}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Out of tokens"
            >
                <div className={styles.panel_head}>
                    <span className={styles.panel_icon}>
                        <Zap size={20} />
                    </span>
                    <h3 className={styles.panel_title}>You're out of tokens</h3>
                    <button className={styles.panel_close} onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <p className={styles.panel_desc}>
                    You have used all your tokens, so you can't build new apps right now. Upgrade to a plan to get
                    more tokens and keep building.
                </p>

                <div className={styles.upgrade_plans}>
                    {UPGRADE_PLANS.map((plan) => (
                        <div key={plan.name} className={styles.upgrade_plan}>
                            <div className={styles.upgrade_plan_info}>
                                <span className={styles.upgrade_plan_name}>{plan.name}</span>
                                <span className={styles.upgrade_plan_meta}>
                                    {plan.tokens} million tokens · up to {plan.apps} apps
                                </span>
                            </div>
                            <div className={styles.upgrade_plan_price}>
                                <span className={styles.upgrade_plan_amount}>₹{plan.price}</span>
                                <span className={styles.upgrade_plan_per}>/ month · ≈ ${plan.usd}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <p className={styles.upgrade_note}>
                    Each app uses roughly 50k tokens. Billed monthly in INR, dollar amounts are approximate.
                </p>

                <div className={styles.panel_actions}>
                    <button className={styles.panel_btn} onClick={onClose}>
                        Maybe later
                    </button>
                    <button className={`${styles.panel_btn} ${styles.panel_btn_primary}`} onClick={onUpgrade}>
                        Upgrade
                    </button>
                </div>
            </div>
        </div>
    )
}

function ConversationHistory({ user, onNavigate }) {
    const { data: history, error, isLoading } = useQuery({
        queryKey: ["conversations", user?.id],
        queryFn: () => fetchConversations(user?.id),
        enabled: !!user?.id,
        staleTime: 1000 * 60 * 5,
    })
    const pathname = usePathname()

    if (isLoading) return <p className={styles.muted}>Loading...</p>
    if (error) return <p className={styles.muted}>Could not load chats</p>
    if (!history || history.length === 0) return <p className={styles.muted}>No chats yet</p>

    return (
        <div className={styles.history_list}>
            {history.map((conv) => {
                const href = `/chat/${conv.id}`
                return (
                    <Link
                        key={conv.id}
                        href={href}
                        onClick={onNavigate}
                        title={conv.title || "Untitled Conversation"}
                        className={`${styles.history_item} ${pathname === href ? styles.item_active : ""}`}
                    >
                        {conv.title || "Untitled Conversation"}
                    </Link>
                )
            })}
        </div>
    )
}

export function Sidebar({ sidebar_open, setSidebar_open, links = default_links, user, credits }) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = useState(false)

    const name = user?.user_metadata?.full_name
    const email = user?.email || ""
    const initial = (name?.[0] || email[0] || "?").toUpperCase()
    const close = () => setSidebar_open(false)

    useEffect(() => {
        try {
            setCollapsed(localStorage.getItem("sidebar_collapsed") === "1")
        } catch {}
    }, [])

    const toggleCollapsed = () => {
        const next = !collapsed
        setCollapsed(next)
        try {
            localStorage.setItem("sidebar_collapsed", next ? "1" : "0")
        } catch {}
    }

    return (
        <>
            {sidebar_open && <div className={styles.sidebar_backdrop} onClick={close} />}

            <aside
                className={`${styles.sidebar} ${sidebar_open ? styles.sidebar_open : ""} ${collapsed ? styles.sidebar_collapsed : ""}`}
            >
                <div className={styles.sidebar_top}>
                    <Link href="/dashboard" className={styles.brand} onClick={close}>
                        <img src={logo.src} className={styles.brand_logo} alt="" />
                        <span className={styles.brand_name}>Lunaar</span>
                    </Link>
                    <button
                        className={styles.collapse_btn}
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                </div>

                {user && (
                    <Link href="/profile" className={styles.account_card} onClick={close} title={name || email}>
                        <span className={styles.user_avatar}>{initial}</span>
                        <span className={styles.account_text}>
                            <span className={styles.user_name}>{name || email}</span>
                            <span className={styles.account_sub}>Personal workspace</span>
                        </span>
                        <ChevronsUpDown size={15} className={styles.account_chevron} />
                    </Link>
                )}

                <nav className={styles.side_nav}>
                    {links.map(({ label, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={close}
                            title={label}
                            className={`${styles.side_link} ${pathname === href ? styles.item_active : ""}`}
                        >
                            <Icon size={18} strokeWidth={1.8} />
                            <span className={styles.side_label}>{label}</span>
                        </Link>
                    ))}
                </nav>

                {!collapsed && (
                    <div className={styles.history_section}>
                        <h3 className={styles.history_h3}>Recent</h3>
                        <ConversationHistory user={user} onNavigate={close} />
                    </div>
                )}
                {collapsed && <div className={styles.history_section} />}

                <Link href="/profile" className={styles.credit_card} onClick={close} title="Credits">
                    <span className={styles.credit_text}>
                        <span className={styles.credit_title}>{credits ?? 0} credits left</span>
                        <span className={styles.credit_sub}>Unlock more features</span>
                    </span>
                    <span className={styles.credit_icon}>
                        {collapsed ? <Coins size={16} /> : <Zap size={16} />}
                    </span>
                </Link>
            </aside>
        </>
    )
}

const TAU = Math.PI * 2
const TILT = 0.22
const PARTICLE_COUNT = 2800
const PARTICLE_COLOR = "rgb(255, 249, 240)"

function BlackHole() {
    const canvas_ref = useRef(null)

    useEffect(() => {
        const canvas = canvas_ref.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            t: Math.pow(Math.random(), 2.2),
            th: Math.random() * TAU,
            size: 0.6 + Math.random() * 1.1,
            bright: 0.45 + Math.random() * 0.55,
        }))

        let w = 0
        let h = 0
        let dpr = 1
        let cx = 0
        let cy = 0
        let R = 0
        let r_in = 0
        let r_out = 0
        let raf = 0
        let running = true

        const resize = () => {
            const rect = canvas.parentElement.getBoundingClientRect()
            dpr = Math.min(window.devicePixelRatio || 1, 2)
            w = rect.width
            h = rect.height
            canvas.width = Math.round(w * dpr)
            canvas.height = Math.round(h * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            R = Math.max(34, Math.min(72, Math.min(w, h) * 0.07))
            cx = w / 2
            cy = h * (w < 768 ? 0.17 : 0.2)
            r_in = R * 1.45
            r_out = Math.min(R * 6.2, w * 0.44)
        }

        const drawDisk = (time, front) => {
            ctx.globalCompositeOperation = "lighter"
            ctx.fillStyle = PARTICLE_COLOR
            for (const p of particles) {
                const r = r_in + (r_out - r_in) * p.t
                const th = p.th + 0.85 * Math.pow(r_in / r, 1.5) * time
                const s = Math.sin(th)
                if ((s > 0) !== front) continue
                const c = Math.cos(th)
                const beam = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * c, 1.4)
                const alpha = Math.min(1, p.bright * beam * Math.pow(r_in / r, 1.3) * 1.15)
                ctx.globalAlpha = alpha
                ctx.fillRect(cx + c * r - p.size / 2, cy + s * r * TILT - p.size / 2, p.size, p.size)
            }
            ctx.globalAlpha = 1
            ctx.globalCompositeOperation = "source-over"
        }

        const drawLensed = (time) => {
            ctx.globalCompositeOperation = "lighter"
            ctx.fillStyle = PARTICLE_COLOR
            for (const p of particles) {
                const r = r_in + (r_out - r_in) * p.t
                const th = p.th + 0.85 * Math.pow(r_in / r, 1.5) * time
                const s = Math.sin(th)
                const c = Math.cos(th)
                const beam = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * c, 1.4)
                const base = p.bright * beam
                const k = Math.pow(p.t, 0.8)
                if (s < 0) {
                    const rl = R * (1.07 + 0.85 * k)
                    ctx.globalAlpha = Math.min(1, base * (1 - 0.55 * k) * 1.5)
                    ctx.fillRect(cx + c * rl - p.size / 2, cy + s * rl - p.size / 2, p.size, p.size)
                } else {
                    const rl = R * (1.07 + 0.3 * k)
                    ctx.globalAlpha = Math.min(1, base * (1 - 0.6 * k) * 0.45)
                    ctx.fillRect(cx + c * rl - p.size / 2, cy + s * rl - p.size / 2, p.size, p.size)
                }
            }
            ctx.globalAlpha = 1
            ctx.globalCompositeOperation = "source-over"
        }

        const draw = (now) => {
            const time = now / 1000
            ctx.clearRect(0, 0, w, h)

            const glow = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 4.5)
            glow.addColorStop(0, "rgba(255, 255, 255, 0.16)")
            glow.addColorStop(0.25, "rgba(255, 255, 255, 0.05)")
            glow.addColorStop(1, "rgba(255, 255, 255, 0)")
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(cx, cy, R * 4.5, 0, TAU)
            ctx.fill()

            drawDisk(time, false)

            const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.2)
            halo.addColorStop(0, "rgba(0, 0, 0, 0.55)")
            halo.addColorStop(1, "rgba(0, 0, 0, 0)")
            ctx.fillStyle = halo
            ctx.beginPath()
            ctx.arc(cx, cy, R * 2.2, 0, TAU)
            ctx.fill()

            ctx.fillStyle = "#000"
            ctx.beginPath()
            ctx.arc(cx, cy, R, 0, TAU)
            ctx.fill()

            drawLensed(time)

            ctx.save()
            ctx.shadowColor = "rgba(255, 255, 255, 0.9)"
            ctx.shadowBlur = 18 * dpr
            ctx.lineWidth = 1.6
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.86 + 0.14 * Math.sin(time * 1.4)})`
            ctx.beginPath()
            ctx.arc(cx, cy, R * 1.03, 0, TAU)
            ctx.stroke()
            ctx.restore()

            ctx.lineWidth = 1
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)"
            ctx.beginPath()
            ctx.arc(cx, cy, R * 1.12, 0, TAU)
            ctx.stroke()

            drawDisk(time, true)
        }

        const loop = (now) => {
            draw(now)
            if (running) raf = requestAnimationFrame(loop)
        }

        const start = () => {
            if (reduce) {
                draw(0)
                return
            }
            running = true
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(loop)
        }

        const onVisibility = () => {
            if (document.hidden) {
                running = false
                cancelAnimationFrame(raf)
            } else {
                start()
            }
        }

        const observer = new ResizeObserver(() => {
            resize()
            if (reduce) draw(0)
        })

        resize()
        observer.observe(canvas.parentElement)
        document.addEventListener("visibilitychange", onVisibility)
        start()

        return () => {
            running = false
            cancelAnimationFrame(raf)
            observer.disconnect()
            document.removeEventListener("visibilitychange", onVisibility)
        }
    }, [])

    return <canvas ref={canvas_ref} className={styles.hole_canvas} />
}

export function Aurora() {
    return (
        <div className={styles.aurora} aria-hidden="true">
            <BlackHole />
        </div>
    )
}

function PageContent() {
    const router = useRouter()
    const { user, loading } = useAuth()
    const [user_input, setUser_input] = useState("")
    const [sidebar_open, setSidebar_open] = useState(false)
    const [git_connected, setGit_connected] = useState(false)
    const [git_checking, setGit_checking] = useState(true)
    const [images, setImages] = useState([])
    const [error, setError] = useState("")
    const [panel_error, setPanel_error] = useState("")
    const [redirect, setRedirect] = useState(false)
    const [supabase_details, setSupabase_details] = useState(null)
    const [supabase_checking, setSupabase_checking] = useState(true)
    const [panel, setPanel] = useState(null)
    const [busy, setBusy] = useState(false)
    const [profile, setProfile] = useState(null)
    const [subscription_popup, setSubscription_popup] = useState(false)
    const file_ref = useRef(null)

    const supabase_connected = !!supabase_details

    const openPanel = (name) => {
        setPanel_error("")
        setPanel(name)
    }

    const closePanel = () => {
        setPanel(null)
        setPanel_error("")
        setBusy(false)
    }

    const closeSubscriptionPopup = () => setSubscription_popup(false)

    const goToSubscription = () => {
        setSubscription_popup(false)
        router.push("/subscription")
    }

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

    useEffect(() => {
        if (!loading && !user) router.replace("/auth")
    }, [loading, user, router])

    useEffect(() => {
        const result = new URLSearchParams(window.location.search).get("github")
        if (!result) return

        if (GITHUB_MESSAGES[result]) {
            setPanel_error(GITHUB_MESSAGES[result])
            setPanel("github")
        }
        if (result === "connected") setGit_connected(true)

        router.replace("/dashboard")
    }, [router])

    useEffect(() => {
        if (!user) return

        const check = async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("remaining_tokens")
                .eq("id", user.id)
                .maybeSingle()

            if (error) console.log(error)
            if (!data) return

            setProfile(data)

            if (typeof data.remaining_tokens === "number" && data.remaining_tokens <= 0) {
                setSubscription_popup(true)
            }
        }

        check()
    }, [user])

    useEffect(() => {
        if (!user) return

        const check = async () => {
            const { data, error } = await supabase
                .from("github_connections")
                .select("*")
                .eq("user_id", user.id)

            if (error) {
                console.log(error)
                setGit_checking(false)
                return
            }

            setGit_connected(!!data && data.length > 0)
            setGit_checking(false)
        }

        check()
    }, [user])

    useEffect(() => {
        if (!user) return

        const check = async () => {
            const { data, error } = await supabase
                .from("supabase_connections")
                .select("*")
                .eq("user_id", user.id)

            if (error) {
                console.log(error)
                setSupabase_checking(false)
                return
            }

            setSupabase_details(data && data.length > 0 ? data : null)
            setSupabase_checking(false)
        }

        check()
    }, [user])

    useEffect(() => {
        const onPageShow = (e) => {
            if (e.persisted) setRedirect(false)
        }
        window.addEventListener("pageshow", onPageShow)
        return () => window.removeEventListener("pageshow", onPageShow)
    }, [])

    const handleSend = () => {
        const message = user_input.trim()
        if (!message || redirect) return

        if (typeof profile?.remaining_tokens === "number" && profile.remaining_tokens <= 0) {
            setSubscription_popup(true)
            return
        }

        const chat_id = crypto.randomUUID()
        try {
            sessionStorage.setItem(`pending:${chat_id}`, JSON.stringify({ message, images }))
        } catch {
            return setError("Images are too large to send. Try fewer or smaller images.")
        }

        setRedirect(true)
        router.push(`/chat/${chat_id}`)
    }

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const Connect_Github = async () => {
        setPanel_error("")
        setBusy(true)
        try {
            await connectGithub()
        } catch (e) {
            setPanel_error(e.message || "Connect failed")
            setBusy(false)
        }
    }

    const Disconnect_Github = async () => {
        if (!user) return
        setPanel_error("")
        setBusy(true)

        const { error } = await supabase
            .from("github_connections")
            .delete()
            .eq("user_id", user.id)

        setBusy(false)

        if (error) {
            setPanel_error(error.message || "Could not disconnect GitHub.")
            return
        }

        setGit_connected(false)
    }

    const Connect_Supabase = async () => {
        setPanel_error("")
        setBusy(true)
        try {
            const headers = await authHeaders()
            const res = await fetch(apiUrl("/api/supabase/connect"), { headers })
            const text = await res.text()

            let data = {}
            try {
                data = JSON.parse(text)
            } catch {
                setPanel_error(`Server returned ${res.status} (not JSON). Check the terminal.`)
                setBusy(false)
                return
            }

            if (!res.ok || !data.url) {
                setPanel_error(data.error || "Could not start the Supabase connection.")
                setBusy(false)
                return
            }

            window.location.href = data.url
        } catch (e) {
            console.log("connect error", e)
            setPanel_error(e.message || "Connect failed")
            setBusy(false)
        }
    }

    const Disconnect_Supabase = async () => {
        if (!user) return
        setPanel_error("")
        setBusy(true)

        const { error } = await supabase
            .from("supabase_connections")
            .delete()
            .eq("user_id", user.id)

        setBusy(false)

        if (error) {
            console.log(error)
            setPanel_error(error.message || "Could not disconnect Supabase.")
            return
        }

        setSupabase_details(null)
    }

    if (loading || !user) return null

    const name = user.user_metadata?.full_name

    return (
        <div className={styles.Page_wrapper}>
            <Sidebar
                sidebar_open={sidebar_open}
                setSidebar_open={setSidebar_open}
                user={user}
                credits={profile?.remaining_tokens}
            />
            <div className={styles.Input_wrapper}>
                <Aurora />
                <div className={styles.nav_top}>
                    <button className={styles.menu_btn} onClick={() => setSidebar_open(true)} aria-label="Open menu">
                        <Menu size={20} />
                    </button>
                    <div className={styles.right_side_wrapper_nav}>
                        <div className={styles.user_profile}>
                            <span>{name?.[0] || user?.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <div className={styles.credit_container} onClick={() => router.push("/subscription")}>
                            <Coins size={18} /> <span>{profile?.remaining_tokens || 0}</span>
                        </div>
                    </div>
                </div>
                <h2>{name || user?.email}, Ready to launch?</h2>
                <div className={styles.Main_Input}>
                    {images.length > 0 && (
                        <div style={{ display: "flex", gap: 8, padding: "8px 0" }}>
                            {images.map((src, i) => (
                                <div key={i} style={{ position: "relative" }}>
                                    <img
                                        src={src}
                                        alt=""
                                        style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
                                    />
                                    <button
                                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                                        aria-label="Remove image"
                                        style={{
                                            position: "absolute",
                                            top: -6,
                                            right: -6,
                                            background: "#222",
                                            border: "none",
                                            borderRadius: 999,
                                            color: "#fff",
                                            width: 18,
                                            height: 18,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {!!error && <p className={styles.error}>{error}</p>}
                    <textarea
                        placeholder="Create a ...."
                        value={user_input}
                        onChange={(e) => setUser_input(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className={styles.btn_wrapper}>
                        <div className={styles.left_btns}>
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
                                onClick={() => openPanel("github")}
                                aria-label={`GitHub, ${git_connected ? "connected" : "not connected"}`}
                                title={`GitHub: ${git_connected ? "connected" : "not connected"}`}
                            >
                                <GithubIcon />
                                <span className={`${styles.badge} ${git_connected ? styles.badge_on : ""}`} />
                            </button>
                            <button
                                className={styles.icon_btn}
                                onClick={() => openPanel("supabase")}
                                aria-label={`Supabase, ${supabase_connected ? "connected" : "not connected"}`}
                                title={`Supabase: ${supabase_connected ? "connected" : "not connected"}`}
                            >
                                <SupabaseIcon />
                                <span className={`${styles.badge} ${supabase_connected ? styles.badge_on : ""}`} />
                            </button>
                        </div>
                        <div className={styles.right_btns}>
                            <button
                                onClick={handleSend}
                                className={styles.send_btn}
                                disabled={!user_input.trim() || profile?.remaining_tokens === 0 || redirect}
                                aria-label="Build now"
                                title="Build now"
                            >
                                <ArrowUp size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {panel === "github" && (
                    <ConnectionPanel
                        title="GitHub"
                        icon={<GithubIcon size={20} />}
                        connected={git_connected}
                        checking={git_checking}
                        busy={busy}
                        error={panel_error}
                        description={
                            git_connected
                                ? "Your account is linked. Generated apps can be pushed to a repository in your GitHub account."
                                : "Connect your GitHub account to push generated apps to a repository. Approve all requested permissions, including workflow."
                        }
                        onConnect={Connect_Github}
                        onDisconnect={Disconnect_Github}
                        onClose={closePanel}
                    />
                )}

                {panel === "supabase" && (
                    <ConnectionPanel
                        title="Supabase"
                        icon={<SupabaseIcon size={20} />}
                        connected={supabase_connected}
                        checking={supabase_checking}
                        busy={busy}
                        error={panel_error}
                        description="Your Supabase API keys are never exposed to the model. It can only call specific tools such as running migrations and SQL."
                        onConnect={Connect_Supabase}
                        onDisconnect={Disconnect_Supabase}
                        onClose={closePanel}
                    >
                        {supabase_connected && (
                            <>
                                <span className={styles.section_label}>Database project</span>
                                <div className={styles.selector_host}>
                                    <SupabaseProjectSelector />
                                </div>
                            </>
                        )}
                    </ConnectionPanel>
                )}

                {subscription_popup && !panel && (
                    <UpgradePanel onUpgrade={goToSubscription} onClose={closeSubscriptionPopup} />
                )}

                {redirect && (
                    <div className={styles.redirecting_wrapper}>
                        <h1>Please Wait While We SetUp Things...</h1>
                    </div>
                )}

                <div className={styles.prompts}>
                    {prompt_cards.map(({ label, icon: Icon, text }) => (
                        <div key={label} className={styles.prompt} onClick={() => setUser_input(text)}>
                            <Icon size={15} strokeWidth={1.6} style={{ marginRight: 8, flexShrink: 0 }} />
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default function Page() {
    return (
        <QueryClientProvider client={queryClient}>
            <PageContent />
        </QueryClientProvider>
    )
}