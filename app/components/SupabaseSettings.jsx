"use client"

import { useEffect, useState } from "react"
import supabase from "../utils/supabase_browser"
import styles from "./supabasesettings.module.css"

function isServiceKey(key) {
    if (key.startsWith("sb_secret_")) return true
    try {
        const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        return JSON.parse(atob(payload)).role === "service_role"
    } catch {
        return false
    }
}

function validate(url, key) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
        return "Enter a project URL like https://abcdxyz.supabase.co"
    }
    if (!key) return "Enter the anon key"
    if (isServiceKey(key)) {
        return "That is a secret or service role key. Use the anon (publishable) key instead."
    }
    return ""
}

export default function SupabaseSettings({ chat_id, user_id, keys, onSaved }) {
    const [url, setUrl] = useState(keys?.supabase_url || "")
    const [key, setKey] = useState(keys?.supabase_anon_key || "")
    const [error, setError] = useState("")
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // The keys are loaded asynchronously by the parent, so useState's initial
    // value is often empty. Copy them into the fields whenever they arrive.
    useEffect(() => {
        if (keys?.supabase_url) setUrl(keys.supabase_url)
        if (keys?.supabase_anon_key) setKey(keys.supabase_anon_key)
    }, [keys])

    const handleSave = async () => {
        const clean_url = url.trim().replace(/\/$/, "")
        const clean_key = key.trim()
        const problem = validate(clean_url, clean_key)
        if (problem) {
            setError(problem)
            return
        }
        setError("")
        setSaving(true)
        const row = {
            chat_id,
            user_id,
            supabase_url: clean_url,
            supabase_anon_key: clean_key,
            updated_at: new Date().toISOString(),
        }
        const { error: save_error } = await supabase
            .from("project_settings")
            .upsert(row, { onConflict: "user_id,chat_id" })
        setSaving(false)
        if (save_error) {
            console.log("project_settings save failed:", save_error.message)
            setError(save_error.message)
            return
        }
        setSaved(true)
        onSaved({ supabase_url: clean_url, supabase_anon_key: clean_key })
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Supabase</h3>
            <p className={styles.text}>
                Add your project keys to run the preview against your own database. They are
                never sent to the AI. Use the anon (publishable) key only, never the service
                role key.
            </p>

            <label className={styles.label}>Project URL</label>
            <input
                className={styles.input}
                value={url}
                onChange={(e) => {
                    setUrl(e.target.value)
                    setSaved(false)
                }}
                placeholder="https://abcdxyz.supabase.co"
                spellCheck={false}
            />

            <label className={styles.label}>Anon key</label>
            <input
                className={styles.input}
                value={key}
                onChange={(e) => {
                    setKey(e.target.value)
                    setSaved(false)
                }}
                placeholder="eyJ... or sb_publishable_..."
                spellCheck={false}
                type="password"
            />

            {!!error && <p className={styles.error}>{error}</p>}
            {saved && <p className={styles.ok}>Saved. Open Preview to run with these keys.</p>}

            <button className={styles.save} onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
            </button>
        </div>
    )
}