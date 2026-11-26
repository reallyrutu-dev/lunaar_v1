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
    updated: { fontSize: 13.5, color: "#7d766c", margin: "0 0 32px" },
    h2: { fontFamily: serif, fontWeight: 400, fontSize: 26, margin: "48px 0 12px", color: "#fff" },
    p: { margin: "0 0 14px", fontSize: 15, color: "#c9c1b5" },
    list: { margin: "0 0 14px", paddingLeft: 20, fontSize: 15, color: "#c9c1b5" },
    li: { marginBottom: 8 },
    divider: { border: "none", borderTop: "1px solid #3a3633", margin: "56px 0 0" },
    note: {
        margin: "0 0 14px",
        paddingLeft: 14,
        borderLeft: "2px solid #6a635c",
        fontSize: 14.5,
        color: "#a39b8f",
    },
    foot: { marginTop: 64, fontSize: 13, color: "#7d766c" },
}

const SECTIONS = [
    {
        title: "1. What we collect",
        body: [
            `Account information — such as your name, email address and login details — when you sign up.`,
            `Usage data — such as the prompts you send, the apps you build and how you use the service, so we can run and improve Lunaar.`,
            `Billing information — processed by our payment provider. We do not store your card details on our servers.`,
        ],
    },
    {
        title: "2. Connecting external tools",
        body: [
            `You can connect external tools such as Supabase and GitHub to Lunaar, and you can disconnect them at any time from your dashboard.`,
            `When a tool is connected, Lunaar can act on your behalf within the limits of that integration — for example, pushing code to your GitHub repository or running migrations on your Supabase project.`,
            `Once you disconnect a tool, Lunaar stops accessing it. Your keys and tokens are removed or deactivated so nothing further can be done on your behalf.`,
        ],
    },
    {
        title: "3. Your keys",
        body: [
            `Your API keys and access tokens are stored securely and are never exposed to the AI model. The model can only call specific, limited tools — such as running migrations and SQL — and cannot read or export your keys.`,
            `Lunaar does not share your keys with anyone.`,
        ],
    },
    {
        title: "4. How we use your data",
        body: [
            `We use your data to run the service, generate and improve the apps you ask for, fix bugs and develop new features.`,
            `We may review anonymized or aggregated usage patterns to understand how Lunaar is used. We never sell your data.`,
        ],
    },
    {
        title: "5. How we store and protect your data",
        body: [
            `We store important data securely using industry-standard safeguards, including encryption in transit and at rest, restricted internal access and regular security reviews.`,
            `No method of storage or transmission is 100% secure. If a breach ever affects your data, we will notify you as required by law.`,
        ],
    },
    {
        title: "6. When we share data",
        body: [
            `We do not sell your personal data, ever. We never have and never will.`,
            `We share data only with the service providers needed to run Lunaar — such as cloud hosting, payment processing and analytics — under strict confidentiality, and only to the extent needed to provide the service.`,
            `We may disclose data if the law requires it, or to protect the rights, safety and security of Lunaar and its users.`,
        ],
    },
    {
        title: "7. Your apps and their data",
        body: [
            `Data stored inside the apps you build belongs to you and lives in the services you connect, such as your own Supabase project. Lunaar does not control or take responsibility for that data.`,
            `You are responsible for handling the data your apps collect, including complying with privacy laws that apply to your users.`,
        ],
    },
    {
        title: "8. Data retention and deletion",
        body: [
            `We keep your data while your account is active. You can ask us to delete your account and associated personal data at any time by emailing hello@lunaar.online.`,
            `Some data may be kept for a limited period where the law requires it, for example for billing records.`,
        ],
    },
    {
        title: "9. Cookies",
        body: [
            `We use a small number of cookies for sign-in sessions and basic analytics. You can block cookies in your browser, though parts of Lunaar may not work without them.`,
        ],
    },
    {
        title: "10. Children",
        body: [
            `Lunaar is not intended for users under 18. If you believe a child has given us their data, contact us and we will remove it.`,
        ],
    },
    {
        title: "11. Changes to this policy",
        body: [
            `Lunaar may update this Privacy Policy from time to time. When we do, we will update this page and revise the date above. For significant changes we will try to notify you in advance.`,
            `Continuing to use Lunaar after an update means you accept the revised policy.`,
        ],
    },
    {
        title: "12. Contact",
        body: [
            `Questions about this policy or your data? Email us at hello@lunaar.online and we will get back to you.`,
        ],
    },
]

export default function Privacy() {
    return (
        <div style={s.page}>
            <div style={s.bar}>
                <Link href="/" style={s.brand}>Lunaar</Link>
                <Link href="/" style={s.back}>Back to home</Link>
            </div>

            <main style={s.wrap}>
                <h1 style={s.h1}>Privacy Policy</h1>
                <p style={s.lead}>
                    How Lunaar handles your data, your keys and your apps.
                </p>
                <p style={s.updated}>Last updated: November 2026</p>

                {SECTIONS.map((sec) => (
                    <section key={sec.title}>
                        <h2 style={s.h2}>{sec.title}</h2>
                        {sec.body.map((para, i) => (
                            <p key={i} style={s.p}>{para}</p>
                        ))}
                    </section>
                ))}

                <p style={s.note}>
                    Your data belongs to you. We never sell it, and we work to keep it safe.
                </p>

                <hr style={s.divider} />
                <p style={s.foot}>
                    Back to the <Link href="/docs" style={{ color: "#a39b8f" }}>Docs</Link>, or read our{" "}
                    <Link href="/terms" style={{ color: "#a39b8f" }}>Terms</Link> and{" "}
                    <Link href="/pricing" style={{ color: "#a39b8f" }}>Pricing</Link> pages.
                </p>
            </main>
        </div>
    )
}