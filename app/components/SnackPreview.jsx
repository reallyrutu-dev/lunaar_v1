"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Snack } from "snack-sdk"
import { Smartphone, QrCode, ExternalLink, Globe } from "lucide-react"
import styles from "./snackpreview.module.css"

const SDK_MAJOR = 54
const SDK_VERSION = SDK_MAJOR + ".0.0"
const BUNDLED_URL =
    "https://raw.githubusercontent.com/expo/expo/sdk-" + SDK_MAJOR + "/packages/expo/bundledNativeModules.json"

const PLAYER_BASE = process.env.NEXT_PUBLIC_SNACK_WEB_PLAYER_URL || ""

const FALLBACK_VERSIONS = {
    "expo-haptics": "~15.0.8",
    "expo-linking": "~8.0.12",
    "expo-constants": "~18.0.14",
    "expo-status-bar": "~3.0.9",
    "@expo/vector-icons": "^15.0.3",
    "react-native-screens": "~4.16.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-worklets": "0.5.1",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-safe-area-context": "~5.6.0",
    "@react-native-async-storage/async-storage": "2.2.0",
}

let bundled_cache = null

async function loadBundledVersions() {
    if (bundled_cache) return bundled_cache
    try {
        const res = await fetch(BUNDLED_URL)
        if (!res.ok) throw new Error("bundled versions unavailable")
        bundled_cache = { ...FALLBACK_VERSIONS, ...(await res.json()) }
    } catch {
        bundled_cache = FALLBACK_VERSIONS
    }
    return bundled_cache
}

function normalizeFiles(files, folder_name) {
    let list = (files || [])
        .filter((f) => f && typeof f.path === "string")
        .map((f) => ({
            path: f.path.trim().replace(/\\/g, "/").replace(/^\.?\/+/, ""),
            content: f.content ?? f.contents ?? "",
        }))

    const prefix = folder_name ? `${folder_name}/` : null
    if (prefix && list.some((f) => f.path.startsWith(prefix))) {
        list = list.map((f) => (f.path.startsWith(prefix) ? { ...f, path: f.path.slice(prefix.length) } : f))
    }

    const hasRootApp = list.some((f) => /^App\.(js|tsx)$/.test(f.path))
    if (!hasRootApp) {
        const nested = list.find((f) => /^[^/]+\/App\.(js|jsx|tsx)$/i.test(f.path))
        if (nested) {
            const dir = nested.path.split("/")[0] + "/"
            list = list.map((f) => (f.path.startsWith(dir) ? { ...f, path: f.path.slice(dir.length) } : f))
        }
    }

    list = list
        .filter((f) => !f.path.startsWith("backend/"))
        .map((f) => {
            if (/^app\.(js|jsx)$/i.test(f.path)) return { ...f, path: "App.js" }
            if (/^app\.tsx$/i.test(f.path)) return { ...f, path: "App.tsx" }
            return f
        })

    return list
}

function toSnackFiles(files) {
    const out = {}
    for (const f of files) {
        if (f.path === "package.json") continue
        out[f.path] = { type: "CODE", contents: f.content }
    }
    return out
}

function toDependencies(files, bundled) {
    const pkg = files.find((f) => f.path === "package.json")
    if (!pkg) return {}
    try {
        const deps = JSON.parse(pkg.content).dependencies || {}
        const out = {}
        for (const [name, version] of Object.entries(deps)) {
            if (name === "expo" || name === "react" || name === "react-native") continue
            out[name] = { version: bundled[name] || String(version) }
        }
        if (out["react-native-reanimated"] && !out["react-native-worklets"] && bundled["react-native-worklets"]) {
            out["react-native-worklets"] = { version: bundled["react-native-worklets"] }
        }
        return out
    } catch {
        return {}
    }
}

const hasEntryFile = (list) => list.some((f) => f.path === "App.js" || f.path === "App.tsx")

const signatureOf = (list) => JSON.stringify(list.map((f) => [f.path, f.content]))

const isLocalHost = () => window.location.hostname === "localhost"

const resolvePlayerURL = () => {
    if (!PLAYER_BASE) return ""
    const base = PLAYER_BASE.startsWith("/") ? window.location.origin + PLAYER_BASE : PLAYER_BASE
    return base.replace(/\/+$/, "")
}

const embedURL = (id, platform) =>
    `https://snack.expo.dev/embedded/${id}?preview=true&platform=${platform}&supportedPlatforms=web,mydevice&theme=dark`

export default function SnackPreview({ folder_name, files }) {
    const [mode, setMode] = useState("web")
    const [live, setLive] = useState(null)
    const [snack_id, setSnack_id] = useState(null)
    const [web_url, setWeb_url] = useState(null)
    const [error, setError] = useState("")
    const [ready, setReady] = useState(false)
    const snack_ref = useRef(null)
    const web_window = useRef(null)
    const code_ref = useRef({})
    const files_ref = useRef(files)
    const signature_ref = useRef("")

    files_ref.current = files

    const attachWebWindow = useCallback((el) => {
        web_window.current = el ? el.contentWindow : null
    }, [])

    useEffect(() => {
        let cancelled = false
        let snack = null
        let unsubscribe = null
        const local = isLocalHost()
        const player_url = local ? "" : resolvePlayerURL()
        const use_live = local || !!player_url

        setLive(use_live)
        setMode(use_live ? "web" : "embed")
        setSnack_id(null)
        setWeb_url(null)
        setError("")
        setReady(false)

        const run = async () => {
            try {
                const normalized = normalizeFiles(files_ref.current, folder_name)

                if (!hasEntryFile(normalized)) {
                    const paths = normalized.map((f) => f.path)
                    console.log("snack files received:", paths)
                    throw new Error(`No root App.js found. Received: ${paths.slice(0, 12).join(", ") || "no files"}`)
                }

                const bundled = await loadBundledVersions()
                if (cancelled) return

                code_ref.current = toSnackFiles(normalized)
                signature_ref.current = signatureOf(normalized)

                snack = new Snack({
                    name: folder_name,
                    sdkVersion: SDK_VERSION,
                    files: code_ref.current,
                    dependencies: toDependencies(normalized, bundled),
                    ...(use_live
                        ? {
                              webPreviewRef: web_window,
                              online: true,
                              ...(player_url ? { webPlayerURL: player_url } : {}),
                          }
                        : {}),
                })
                snack_ref.current = snack

                unsubscribe = snack.addStateListener((state, prev) => {
                    if (cancelled) return
                    if (state.webPreviewURL) setWeb_url(state.webPreviewURL)
                    if (state.connectedClients !== prev.connectedClients) {
                        console.log("snack clients:", Object.keys(state.connectedClients || {}))
                    }
                    if (state.dependencies !== prev.dependencies) {
                        for (const [name, dep] of Object.entries(state.dependencies || {})) {
                            if (dep && dep.error) console.log("snack dependency error:", name, dep)
                        }
                    }
                })

                const initial = snack.getState().webPreviewURL
                if (initial) setWeb_url(initial)

                const saved = await snack.saveAsync()
                console.log("snack saved:", saved)
                if (!cancelled) {
                    setSnack_id(saved.id)
                    setReady(true)
                }
            } catch (e) {
                console.log("snack error:", e)
                if (!cancelled) setError(e?.message || "Could not create the preview.")
            }
        }

        run()

        return () => {
            cancelled = true
            if (unsubscribe) unsubscribe()
            if (snack && use_live) snack.setOnline(false)
            snack_ref.current = null
        }
    }, [folder_name])

    useEffect(() => {
        if (!ready || !snack_ref.current) return

        const normalized = normalizeFiles(files, folder_name)
        if (!hasEntryFile(normalized)) return

        const signature = signatureOf(normalized)
        if (signature === signature_ref.current) return

        let cancelled = false
        let save_timer = null

        const run = async () => {
            const bundled = await loadBundledVersions()
            const snack = snack_ref.current
            if (cancelled || !snack) return

            const next = toSnackFiles(normalized)
            const removed = {}
            for (const path of Object.keys(code_ref.current)) {
                if (!(path in next)) removed[path] = null
            }

            code_ref.current = next
            signature_ref.current = signature

            snack.updateFiles({ ...removed, ...next })
            snack.updateDependencies(toDependencies(normalized, bundled))

            save_timer = setTimeout(async () => {
                try {
                    const saved = await snack.saveAsync()
                    if (!cancelled) setSnack_id(saved.id)
                } catch (e) {
                    console.log("snack re-save failed:", e)
                }
            }, 1500)
        }

        run()

        return () => {
            cancelled = true
            if (save_timer) clearTimeout(save_timer)
        }
    }, [files, ready, folder_name])

    const web_embed_src = snack_id ? embedURL(snack_id, "web") : null
    const device_src = snack_id ? embedURL(snack_id, "mydevice") : null

    return (
        <div className={styles.container}>
            <div className={styles.toggle}>
                <div className={styles.segments} role="tablist" aria-label="Preview mode">
                    {live && (
                        <button
                            role="tab"
                            aria-selected={mode === "web"}
                            className={mode === "web" ? styles.on : ""}
                            onClick={() => setMode("web")}
                        >
                            <Smartphone size={15} />
                            <span className={styles.label}>Screen</span>
                        </button>
                    )}
                    <button
                        role="tab"
                        aria-selected={mode === "embed"}
                        className={mode === "embed" ? styles.on : ""}
                        onClick={() => setMode("embed")}
                    >
                        <Globe size={15} />
                        <span className={styles.label}>{live ? "Embed" : "Web"}</span>
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === "device"}
                        className={mode === "device" ? styles.on : ""}
                        onClick={() => setMode("device")}
                    >
                        <QrCode size={15} />
                        <span className={styles.label}>Device</span>
                    </button>
                </div>

                {snack_id && (
                    <a
                        className={styles.open}
                        href={`https://snack.expo.dev/${snack_id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Snack"
                        title="Open in Snack"
                    >
                        <ExternalLink size={15} />
                        <span className={styles.label}>Open in Snack</span>
                    </a>
                )}
            </div>

            <div className={styles.stage}>
                {error && <div className={styles.error}>{error}</div>}
                {!error && mode === "web" && !web_url && <div className={styles.loading}>Building preview</div>}
                {!error && mode === "embed" && !web_embed_src && <div className={styles.loading}>Building preview</div>}
                {!error && mode === "device" && !device_src && <div className={styles.loading}>Building preview</div>}
                {!error && live && web_url && (
                    <div className={styles.phone} style={{ display: mode === "web" ? undefined : "none" }}>
                        <div className={styles.notch} />
                        <iframe
                            key={web_url}
                            ref={attachWebWindow}
                            className={styles.screen}
                            src={web_url}
                            title="App preview"
                            allow="geolocation; camera; microphone"
                        />
                    </div>
                )}
                {!error && web_embed_src && mode === "embed" && (
                    <iframe
                        key={web_embed_src}
                        className={styles.device}
                        src={web_embed_src}
                        title="Web preview"
                        allow="geolocation; camera; microphone"
                    />
                )}
                {!error && device_src && mode === "device" && (
                    <iframe key={device_src} className={styles.device} src={device_src} title="Run on device" />
                )}
            </div>
        </div>
    )
}