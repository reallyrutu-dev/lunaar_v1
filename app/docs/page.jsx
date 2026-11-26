import Link from "next/link"

const font = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
const serif = '"Lora", Georgia, serif'

const s = {
    page: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: "auto",
        background: "#1a1a1a",
        color: "#f3ece0",
        fontFamily: font,
        lineHeight: 1.7,
    },
    bar: {
        position: "sticky",
        top: 0,
        zIndex: 10,
        height: 60,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(26, 26, 26, 0.85)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #3a3633",
    },
    brand: { color: "#fff", fontWeight: 600, fontSize: 17, textDecoration: "none" },
    back: { color: "#a39b8f", fontSize: 14, textDecoration: "none" },
    wrap: { maxWidth: 720, margin: "0 auto", padding: "56px 24px 96px" },
    h1: { fontFamily: serif, fontWeight: 300, fontSize: 40, lineHeight: 1.15, margin: "0 0 14px", color: "#fff" },
    lead: { fontSize: 16.5, color: "#a39b8f", margin: "0 0 8px" },
    h2: { fontFamily: serif, fontWeight: 400, fontSize: 26, margin: "56px 0 12px", color: "#fff" },
    h3: { fontSize: 15.5, fontWeight: 600, margin: "22px 0 4px", color: "#f3ece0" },
    p: { margin: "0 0 14px", fontSize: 15, color: "#c9c1b5" },
    list: { margin: "0 0 14px", paddingLeft: 20, fontSize: 15, color: "#c9c1b5" },
    li: { marginBottom: 8 },
    divider: { border: "none", borderTop: "1px solid #3a3633", margin: "56px 0 0" },
    tool: { padding: "14px 0", borderBottom: "1px solid #3a3633" },
    toolName: { fontWeight: 600, color: "#f3ece0", fontSize: 15.5, margin: 0 },
    toolText: { margin: "2px 0 0", fontSize: 14.5, color: "#a39b8f" },
    code: {
        background: "#242121",
        border: "1px solid #3a3633",
        borderRadius: 10,
        padding: "16px 18px",
        fontSize: 13.5,
        lineHeight: 1.65,
        color: "#d9d1c4",
        whiteSpace: "pre-wrap",
        margin: "0 0 14px",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    },
    note: { margin: "0 0 14px", paddingLeft: 14, borderLeft: "2px solid #6a635c", fontSize: 14.5, color: "#a39b8f" },
    foot: { marginTop: 64, fontSize: 13, color: "#7d766c" },
}

const TOOLS = [
    { name: "GitHub", text: "Push the app Lunaar builds to a repository in your own GitHub account." },
    { name: "Supabase", text: "Connect a database so the app can store real data. Your API keys are never exposed to the model, which can only call specific tools such as running migrations and SQL." },
    { name: "Expo", text: "Build mobile apps that run on iOS and Android." },
    { name: "Render", text: "Host and deploy what you build so it is live on the internet." },
]

export default function Docs() {
    return (
        <div style={s.page}>
            <div style={s.bar}>
                <Link href="/" style={s.brand}>Lunaar</Link>
                <Link href="/" style={s.back}>Back to home</Link>
            </div>

            <main style={s.wrap}>
                <h1 style={s.h1}>Lunaar docs</h1>
                <p style={s.lead}>
                    Everything you need to know about Lunaar and how to get good results from it.
                </p>

                <h2 style={s.h2}>About Lunaar</h2>
                <p style={s.p}>
                    Lunaar is a vibe coding platform. You describe the app you want in plain words, and Lunaar
                    builds it. It was founded by Ruturaj and Harsh, based in Pune, India.
                </p>

                <h2 style={s.h2}>Models</h2>
                <p style={s.p}>
                    For heavy coding tasks, Lunaar uses GPT 6 Luna. It handles the large, multi-file work such as
                    building full apps, wiring up a database, and making big changes across a project.
                </p>

                <h2 style={s.h2}>Tools Lunaar gives the model</h2>
                <p style={s.p}>
                    Lunaar does not just write code. It gives the model tools so it can work with real services
                    on your behalf.
                </p>
                <div style={{ borderTop: "1px solid #3a3633", marginBottom: 14 }}>
                    {TOOLS.map((t) => (
                        <div key={t.name} style={s.tool}>
                            <p style={s.toolName}>{t.name}</p>
                            <p style={s.toolText}>{t.text}</p>
                        </div>
                    ))}
                </div>
                <p style={s.p}>
                    Connect GitHub and Supabase from the icons next to the prompt box on your dashboard.
                </p>

                <h2 style={s.h2}>Writing a good prompt</h2>
                <p style={s.p}>
                    The model builds what you describe, so the more clearly you describe it, the closer the first
                    result will be. A short prompt works for a simple app. A bigger app needs more detail.
                </p>

                <h3 style={s.h3}>The best way to prompt</h3>
                <ul style={s.list}>
                    <li style={s.li}>Say what the app is and who it is for, in one sentence.</li>
                    <li style={s.li}>Be specific. &quot;A to do list with due dates and a filter for overdue tasks&quot; beats &quot;a to do app&quot;.</li>
                    <li style={s.li}>Describe the look you want, such as modern, minimal or dark. If you have a reference, attach a screenshot (up to 4 images).</li>
                    <li style={s.li}>Name the data it needs to store, like users, tasks or bookings, and what each one holds.</li>
                    <li style={s.li}>Say what you do not want. For example, &quot;no gradients&quot; or &quot;no login screen&quot;.</li>
                    <li style={s.li}>Start with the core version, then ask for changes one at a time.</li>
                </ul>

                <h3 style={s.h3}>How to structure a prompt</h3>
                <p style={s.p}>Cover these parts in order. You can skip any that do not apply.</p>
                <ul style={s.list}>
                    <li style={s.li}><strong>Goal:</strong> what you are building and who uses it.</li>
                    <li style={s.li}><strong>Features:</strong> the main things the app must do.</li>
                    <li style={s.li}><strong>Data:</strong> what needs to be saved, and whether it needs Supabase.</li>
                    <li style={s.li}><strong>Design:</strong> the style, colors and layout you want.</li>
                    <li style={s.li}><strong>Platform:</strong> web app or mobile app.</li>
                    <li style={s.li}><strong>Limits:</strong> anything it should avoid.</li>
                </ul>

                <h3 style={s.h3}>Example</h3>
                <pre style={s.code}>{`Build a bus ticket booking app for commuters in Pune.

Features:
- Search buses by from, to and date
- Pick seats on a seat map
- Book a ticket and see my past bookings

Data: routes, buses, seats and bookings, saved in Supabase.

Design: modern and clean, dark theme, one accent color.
No gradients.

Platform: web app that works well on mobile.`}</pre>

                <h3 style={s.h3}>Asking for changes</h3>
                <p style={s.p}>
                    After the first build, make one request at a time and say exactly what to change.
                    &quot;Make the Book button full width and move it to the bottom of the screen&quot; works better
                    than &quot;improve the layout&quot;.
                </p>
                <p style={s.note}>
                    Each message uses tokens. Clear prompts get it right the first time and save your tokens.
                </p>

                <hr style={s.divider} />
                <p style={s.foot}>
                    Questions? Read our <Link href="/terms" style={{ color: "#a39b8f" }}>Terms</Link> and{" "}
                    <Link href="/privacy" style={{ color: "#a39b8f" }}>Privacy</Link> pages, or head to{" "}
                    <Link href="/pricing" style={{ color: "#a39b8f" }}>Pricing</Link>.
                </p>
            </main>
        </div>
    )
}