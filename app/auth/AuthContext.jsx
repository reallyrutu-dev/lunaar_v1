"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import supabase from "../utils/supabase_browser"

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        supabase.auth.getSession().then(({ data }) => {
            if (!mounted) return
            setSession(data.session)
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_event, next_session) => {
            setSession(next_session)
            setLoading(false)
        })

        return () => {
            mounted = false
            listener.subscription.unsubscribe()
        }
    }, [])

    const value = useMemo(
        () => ({
            session,
            user: session?.user ?? null,
            loading,
            signInWithProvider: async (provider) => {
                try {
                    const { error } = await supabase.auth.signInWithOAuth({
                        provider,
                        options: { redirectTo: `${window.location.origin}/dashboard` },
                    })
                    return { error: error ? error.message : null }
                } catch (e) {
                    return { error: e instanceof Error ? e.message : "Sign in failed." }
                }
            },
            signOut: async () => {
                await supabase.auth.signOut()
            },
        }),
        [session, loading]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) {
        throw new Error("useAuth must be used inside AuthProvider")
    }
    return ctx
}