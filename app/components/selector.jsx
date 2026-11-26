"use client"

import { useEffect, useState } from "react"
import supabase from "../utils/supabase_browser"

const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
    }
}

export default function SupabaseProjectSelector() {
    const [projects, setProjects] = useState([])
    const [selected, setSelected] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        const load = async () => {
            try {
                const res = await fetch("/api/supabase/projects", { headers: await authHeaders() })
                const data = await res.json()
                if (!active) return
                if (!res.ok) {
                    setError(data.error || "Could not load projects")
                    return
                }
                setProjects(data.projects || [])
                setSelected(data.selected || "")
            } catch {
                if (active) setError("Could not reach the server")
            } finally {
                if (active) setLoading(false)
            }
        }
        load()
        return () => {
            active = false
        }
    }, [])

    const handleChange = async (e) => {
        const ref = e.target.value
        if (!ref) return
        const previous = selected
        setSelected(ref)
        setSaving(true)
        setError("")
        try {
            const res = await fetch("/api/supabase/projects", {
                method: "POST",
                headers: await authHeaders(),
                body: JSON.stringify({ ref }),
            })
            const data = await res.json()
            if (!res.ok) {
                setSelected(previous)
                setError(data.error || "Could not select project")
            }
        } catch {
            setSelected(previous)
            setError("Could not reach the server")
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <span>Loading Supabase projects...</span>
    if (error && projects.length === 0) return <span>{error}</span>
    if (projects.length === 0) return <span>No Supabase projects found</span>

    return (
        <div>
            <select value={selected} onChange={handleChange} disabled={saving}>
                <option value="" disabled>
                    Select a Supabase project
                </option>
                {projects.map((p) => (
                    <option key={p.ref} value={p.ref}>
                        {p.name} ({p.region})
                    </option>
                ))}
            </select>
            {!!error && <p>{error}</p>}
        </div>
    )
}