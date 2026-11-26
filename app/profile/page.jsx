"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { Sidebar } from "../dashboard/page"
import { useAuth } from "../auth/AuthContext"
import { SquareChevronRight } from "lucide-react"
import supabase from "../utils/supabase_browser"
import styles from "./profile.module.css"

function formatDate(value) {
    if (!value) return "—"
    return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
}

function Row({ label, children }) {
    return (
        <div className={styles.row}>
            <span className={styles.label}>{label}</span>
            <span className={styles.value}>{children}</span>
        </div>
    )
}

function ConfirmPanel({ busy, error, onConfirm, onCancel }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && !busy) onCancel()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onCancel, busy])

    return (
        <div className={styles.panel_backdrop} onClick={() => !busy && onCancel()}>
            <div
                className={styles.panel_card}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-label="Log out"
            >
                <h3 className={styles.panel_title}>Log out</h3>
                <p className={styles.panel_desc}>
                    You will need to sign in again to access your apps and conversation history.
                </p>
                {!!error && <p className={styles.panel_error}>{error}</p>}
                <div className={styles.panel_actions}>
                    <button className={styles.panel_btn} onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        className={`${styles.panel_btn} ${styles.panel_btn_primary}`}
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? "Logging out..." : "Log out"}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ProfileContent() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user, loading } = useAuth()
    const [sidebar_open, setSidebar_open] = useState(false)
    const [tokens, setTokens] = useState(null)
    const [confirm_open, setConfirm_open] = useState(false)
    const [logging_out, setLogging_out] = useState(false)
    const [logout_error, setLogout_error] = useState("")

    useEffect(() => {
        if (!user) return

        const load = async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("remaining_tokens")
                .eq("id", user.id)
                .maybeSingle()

            if (error) console.log(error)
            setTokens(data?.remaining_tokens ?? 0)
        }

        load()
    }, [user])

    useEffect(() => {
        if (!loading && !user && !logging_out) router.replace("/auth")
    }, [loading, user, logging_out, router])

    const closeConfirm = () => {
        if (logging_out) return
        setConfirm_open(false)
        setLogout_error("")
    }

    const handleLogout = async () => {
        setLogout_error("")
        setLogging_out(true)

        const { error } = await supabase.auth.signOut()

        if (error) {
            setLogout_error(error.message || "Could not log out. Try again.")
            setLogging_out(false)
            return
        }

        queryClient.clear()
        router.replace("/auth")
    }

    if (loading || !user) return null

    const name = user.user_metadata?.full_name
    const email = user.email || ""
    const initial = (name?.[0] || email[0] || "?").toUpperCase()

    return (
        <div className={styles.profile_page_wrapper}>
            <Sidebar sidebar_open={sidebar_open} setSidebar_open={setSidebar_open} user={user} />

            <div className={styles.profile_main_content}>
                <div className={styles.nav}>
                    <button onClick={() => setSidebar_open(true)} aria-label="Open sidebar">
                        <SquareChevronRight size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    <h1>Account</h1>

                    <div className={styles.identity}>
                        <div className={styles.avatar}>{initial}</div>
                        <div>
                            <div className={styles.identity_name}>{name || email}</div>
                            {name && <div className={styles.identity_email}>{email}</div>}
                        </div>
                    </div>

                    <div className={styles.list}>
                        <Row label="Plan">Free</Row>
                        <Row label="Tokens left">{tokens === null ? "—" : tokens.toLocaleString()}</Row>
                        <Row label="Joined">{formatDate(user.created_at)}</Row>
                    </div>

                    <button className={styles.logout} onClick={() => setConfirm_open(true)}>
                        Log out
                    </button>
                </div>
            </div>

            {confirm_open && (
                <ConfirmPanel
                    busy={logging_out}
                    error={logout_error}
                    onConfirm={handleLogout}
                    onCancel={closeConfirm}
                />
            )}
        </div>
    )
}

export default function Profile() {
    const [queryClient] = useState(() => new QueryClient())

    return (
        <QueryClientProvider client={queryClient}>
            <ProfileContent />
        </QueryClientProvider>
    )
}