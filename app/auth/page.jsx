"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "./AuthContext"
import styles from "./login.module.css"

const TAU = Math.PI * 2
const TILT = 0.22
const PARTICLE_COUNT = 2200

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
            size: 0.6 + Math.random() * 1.0,
            bright: 0.4 + Math.random() * 0.6,
        }))

        let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, R = 0, r_in = 0, r_out = 0, raf = 0
        let running = true

        const resize = () => {
            const rect = canvas.parentElement.getBoundingClientRect()
            dpr = Math.min(window.devicePixelRatio || 1, 2)
            w = rect.width
            h = rect.height
            canvas.width = Math.round(w * dpr)
            canvas.height = Math.round(h * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            R = Math.max(28, Math.min(64, Math.min(w, h) * 0.085))
            cx = w / 2
            cy = h * 0.46
            r_in = R * 1.45
            r_out = Math.min(R * 6.4, w * 0.44)
        }

        const disk = (time, front) => {
            ctx.globalCompositeOperation = "lighter"
            ctx.fillStyle = "rgb(243, 236, 224)"
            for (const p of particles) {
                const r = r_in + (r_out - r_in) * p.t
                const th = p.th + 0.8 * Math.pow(r_in / r, 1.5) * time
                const s = Math.sin(th)
                if ((s > 0) !== front) continue
                const c = Math.cos(th)
                const beam = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * c, 1.4)
                ctx.globalAlpha = Math.min(1, p.bright * beam * Math.pow(r_in / r, 1.3) * 1.1)
                ctx.fillRect(cx + c * r - p.size / 2, cy + s * r * TILT - p.size / 2, p.size, p.size)
            }
            ctx.globalAlpha = 1
            ctx.globalCompositeOperation = "source-over"
        }

        const lensed = (time) => {
            ctx.globalCompositeOperation = "lighter"
            ctx.fillStyle = "rgb(243, 236, 224)"
            for (const p of particles) {
                const r = r_in + (r_out - r_in) * p.t
                const th = p.th + 0.8 * Math.pow(r_in / r, 1.5) * time
                const s = Math.sin(th)
                const c = Math.cos(th)
                const beam = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * c, 1.4)
                const base = p.bright * beam
                const k = Math.pow(p.t, 0.8)
                const rl = s < 0 ? R * (1.07 + 0.85 * k) : R * (1.07 + 0.3 * k)
                ctx.globalAlpha = Math.min(1, s < 0 ? base * (1 - 0.55 * k) * 1.4 : base * (1 - 0.6 * k) * 0.4)
                ctx.fillRect(cx + c * rl - p.size / 2, cy + s * rl - p.size / 2, p.size, p.size)
            }
            ctx.globalAlpha = 1
            ctx.globalCompositeOperation = "source-over"
        }

        const draw = (now) => {
            const time = now / 1000
            ctx.clearRect(0, 0, w, h)

            disk(time, false)

            ctx.fillStyle = "#000"
            ctx.beginPath()
            ctx.arc(cx, cy, R, 0, TAU)
            ctx.fill()

            lensed(time)

            ctx.lineWidth = 1.2
            ctx.strokeStyle = "rgba(243, 236, 224, 0.85)"
            ctx.beginPath()
            ctx.arc(cx, cy, R * 1.03, 0, TAU)
            ctx.stroke()

            disk(time, true)
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

    return <canvas ref={canvas_ref} className={styles.canvas} aria-hidden="true" />
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
    )
}

function GithubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
    )
}

export default function Login() {
    const router = useRouter()
    const { user, loading, signInWithProvider } = useAuth()
    const [active, setActive] = useState(null)
    const [error, setError] = useState("")

    useEffect(() => {
        if (!loading && user) router.replace("/dashboard")
    }, [user, loading, router])

    const handle = async (provider) => {
        setError("")
        setActive(provider)
        const { error: auth_error } = await signInWithProvider(provider)
        if (auth_error) {
            setError(auth_error)
            setActive(null)
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.art}>
                <BlackHole />
                <div className={styles.brand}>
                    <img src="/logo.png" className={styles.logo} alt="" />
                    <span className={styles.brand_name}>Lunaar</span>
                </div>
                <p className={styles.caption}>Describe an app in plain words and get an Expo project you can run on your phone.</p>
            </div>

            <div className={styles.form_side}>
                <div className={styles.form}>
                    <h1 className={styles.title}>Sign in</h1>
                    <p className={styles.subtitle}>New here? Signing in with either account creates your workspace.</p>

                    <button className={styles.button} onClick={() => handle("google")} disabled={!!active}>
                        {active === "google" ? <Loader2 size={18} className={styles.spin} /> : <GoogleIcon />}
                        <span>Continue with Google</span>
                    </button>

                    <button className={styles.button} onClick={() => handle("github")} disabled={!!active}>
                        {active === "github" ? <Loader2 size={18} className={styles.spin} /> : <GithubIcon />}
                        <span>Continue with GitHub</span>
                    </button>

                    {!!error && <p className={styles.error}>{error}</p>}
                </div>
            </div>
        </div>
    )
}