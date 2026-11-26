"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Menu, X, Check, Sparkles, Image as ImageIcon, Database, Rocket } from "lucide-react"
import styles from "./page.module.css"
import logo from "../public/logo.png"

const TAU = Math.PI * 2
const TILT = 0.22
const PARTICLE_COUNT = 2800
const PARTICLE_COLOR = "rgb(255, 249, 240)"

/**
 * Same black hole as the dashboard, packaged as a standalone component.
 * It fills its parent (which must be position: relative / absolute with a size).
 * `centerY` is the vertical position of the hole as a fraction of the parent height.
 */
function BlackHole({ centerY = 0.2, centerYMobile = 0.17 }) {
    const canvas_ref = useRef(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const canvas = canvas_ref.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        setReady(true)

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
            cy = h * (w < 768 ? centerYMobile : centerY)
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
    }, [centerY, centerYMobile])

    return (
        <canvas
            ref={canvas_ref}
            aria-hidden="true"
            style={{
                display: "block",
                width: "100%",
                height: "100%",
                opacity: ready ? 1 : 0,
                transition: "opacity 2.4s ease",
            }}
        />
    )
}

const NAV_LINKS = [
    { label: "Docs", href: "/docs" },
    { label: "Pricing", href: "/pricing" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
]

const FEATURES = [
    {
        icon: Sparkles,
        title: "Describe it, get an app",
        text: "Write what you want in plain words. Lunaar builds it and keeps going when you ask for changes.",
    },
    {
        icon: ImageIcon,
        title: "Start from a screenshot",
        text: "Attach up to 4 images as a reference for the layout and style you have in mind.",
    },
    {
        icon: Database,
        title: "Connect a real database",
        text: "Link your Supabase project. Your API keys are never exposed to the model.",
    },
    {
        icon: Rocket,
        title: "Push to GitHub",
        text: "Send the generated app to a repository in your own GitHub account.",
    },
]

const PLANS = [
    { name: "Free", price: "₹0", usd: null, tokens: "150,000 tokens", note: "Enough to build your first apps" },
    { name: "Vibe", price: "₹199", usd: "≈ $2.14", tokens: "3 million tokens", note: "Up to 50+ apps", highlight: true },
    { name: "Max", price: "₹499", usd: "≈ $5.37", tokens: "10 million tokens", note: "Up to 200 apps" },
    { name: "Studio", price: "₹999", usd: "≈ $10.76", tokens: "25 million tokens", note: "Up to 500 apps" },
]

export default function Home() {
    const [menu_open, setMenu_open] = useState(false)
    const close = () => setMenu_open(false)

    useEffect(() => {
        if (!menu_open) return
        const onKey = (e) => {
            if (e.key === "Escape") setMenu_open(false)
        }
        window.addEventListener("keydown", onKey)
        document.body.style.overflow = "hidden"
        return () => {
            window.removeEventListener("keydown", onKey)
            document.body.style.overflow = ""
        }
    }, [menu_open])

    return (
        <div className={styles.page}>
            <header className={styles.nav}>
                <Link href="/" className={styles.brand}>
                    <img src={logo.src} className={styles.brand_logo} alt="" />
                    <span>Lunaar</span>
                </Link>

                <nav className={styles.nav_links} aria-label="Main">
                    {NAV_LINKS.map(({ label, href }) => (
                        <Link key={href} href={href} className={styles.nav_link}>
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className={styles.nav_actions}>
                    <Link href="/dashboard" className={styles.btn_ghost}>
                        Log in
                    </Link>
                    <Link href="/auth" className={styles.btn_solid}>
                        Sign up
                    </Link>
                </div>

                <button className={styles.menu_btn} onClick={() => setMenu_open(true)} aria-label="Open menu">
                    <Menu size={22} />
                </button>
            </header>

            {menu_open && <div className={styles.backdrop} onClick={close} />}
            <aside
                className={`${styles.sidebar} ${menu_open ? styles.sidebar_open : ""}`}
                aria-hidden={!menu_open}
                aria-label="Menu"
            >
                <div className={styles.sidebar_top}>
                    <Link href="/" className={styles.brand} onClick={close}>
                        <img src={logo.src} className={styles.brand_logo} alt="" />
                        <span>Lunaar</span>
                    </Link>
                    <button className={styles.close_btn} onClick={close} aria-label="Close menu">
                        <X size={20} />
                    </button>
                </div>

                <nav className={styles.sidebar_links}>
                    <Link href="/" className={styles.sidebar_link} onClick={close}>
                        Home
                    </Link>
                    {NAV_LINKS.map(({ label, href }) => (
                        <Link key={href} href={href} className={styles.sidebar_link} onClick={close}>
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className={styles.sidebar_actions}>
                    <Link href="/dashboard" className={styles.btn_ghost} onClick={close}>
                        Log in
                    </Link>
                    <Link href="/auth" className={styles.btn_solid} onClick={close}>
                        Sign up
                    </Link>
                </div>
            </aside>

            <main>
                <section className={styles.hero}>
                    <div className={styles.hole}>
                        <BlackHole centerY={0.2} centerYMobile={0.17} />
                    </div>

                    <div className={styles.hero_content}>
                        <h1>Describe an app. Launch it today.</h1>
                        <p className={styles.hero_sub}>
                            Lunaar turns a plain-language idea into a working app you can connect to Supabase and
                            push to GitHub. Start with 150,000 free tokens, no card needed.
                        </p>

                        <div className={styles.hero_actions}>
                            <Link href="/auth" className={styles.btn_solid_lg}>
                                Sign up free
                            </Link>
                            <Link href="/dashboard" className={styles.btn_ghost_lg}>
                                Log in
                            </Link>
                        </div>

                        <p className={styles.hero_price}>
                            Paid plans start at ₹199 a month, about $2.14.
                        </p>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2 className={styles.section_title}>Everything between the idea and the repo</h2>
                    <ul className={styles.features}>
                        {FEATURES.map(({ icon: Icon, title, text }) => (
                            <li key={title} className={styles.feature}>
                                <Icon size={20} strokeWidth={1.6} className={styles.feature_icon} />
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.section} id="pricing">
                    <h2 className={styles.section_title}>Start free. Upgrade for as little as ₹199.</h2>
                    <p className={styles.section_sub}>
                        Every account gets 150,000 free tokens. Paid plans are billed monthly in INR, and dollar
                        amounts are approximate.
                    </p>

                    <ul className={styles.plans}>
                        {PLANS.map((plan) => (
                            <li
                                key={plan.name}
                                className={`${styles.plan} ${plan.highlight ? styles.plan_highlight : ""}`}
                            >
                                <div className={styles.plan_name}>
                                    <h3>{plan.name}</h3>
                                    {plan.highlight && <span className={styles.plan_tag}>Cheapest paid plan</span>}
                                </div>

                                <div className={styles.plan_details}>
                                    <span className={styles.plan_tokens}>
                                        <Check size={15} strokeWidth={2} />
                                        {plan.tokens}
                                    </span>
                                    <span className={styles.plan_note}>{plan.note}</span>
                                </div>

                                <div className={styles.plan_price}>
                                    <span className={styles.amount}>{plan.price}</span>
                                    {plan.usd ? (
                                        <span className={styles.per}>/ month {plan.usd}</span>
                                    ) : (
                                        <span className={styles.per}>forever</span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.cta}>
                    <h2>Your first app is on us. 150,000 tokens, free.</h2>
                    <Link href="/auth" className={styles.btn_solid_lg}>
                        Sign up free
                    </Link>
                </section>
            </main>

            <footer className={styles.footer}>
                <span className={styles.footer_brand}>© {new Date().getFullYear()} Lunaar</span>
                <nav className={styles.footer_links} aria-label="Footer">
                    {NAV_LINKS.map(({ label, href }) => (
                        <Link key={href} href={href}>
                            {label}
                        </Link>
                    ))}
                </nav>
            </footer>
        </div>
    )
}