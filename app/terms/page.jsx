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
        title: "1. Acceptance of terms",
        body: [
            `By creating an account or using Lunaar, you agree to these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, do not use Lunaar.`,
            `You must be at least 18 years old and able to form a binding contract to use Lunaar.`,
        ],
    },
    {
        title: "2. About the service",
        body: [
            `Lunaar is a vibe coding platform. You describe an app in plain words and Lunaar builds it using AI models and connected tools such as GitHub, Supabase, Expo and Render.`,
            `We may add, change or remove features at any time. We try to keep the service reliable, but we do not guarantee it will be available at all times or free of errors.`,
        ],
    },
    {
        title: "3. Your account",
        body: [
            `You are responsible for keeping your account credentials secure and for everything done under your account.`,
            `Let us know straight away if you think someone has accessed your account without permission.`,
        ],
    },
    {
        title: "4. Payments and no refunds",
        body: [
            `Paid plans are billed in advance for each billing period. Your plan renews automatically until you cancel it.`,
            `All payments are final. Once a plan is purchased, there will be no refund, full or partial, for any reason. This includes unused tokens, remaining billing periods and downgrades.`,
            `If you cancel, you keep access until the end of the current billing period. Cancellation does not entitle you to a refund for that period.`,
            `We may change plan prices at any time. Price changes apply from your next renewal, and we will let you know in advance.`,
        ],
    },
    {
        title: "5. Your keys and integrations",
        body: [
            `When you connect services like GitHub or Supabase, you authorize Lunaar to act on your behalf within the limits of those integrations.`,
            `Lunaar does not share your API keys, tokens or credentials with anyone. Your keys are stored securely and are never exposed to the AI model, which can only call specific, limited tools such as running migrations and SQL.`,
            `You can disconnect an integration at any time. You remain responsible for the accounts and services you connect.`,
        ],
    },
    {
        title: "6. Your apps and content",
        body: [
            `You own the apps and content you create with Lunaar. Anything you choose to build, publish or deploy is your property and your responsibility.`,
            `Anything put inside an app — data, text, images, code, links and any material it displays or collects — is fully controlled by and the sole responsibility of you, the user, not Lunaar.`,
            `You must make sure your apps and their content comply with all applicable laws and third-party rights. Lunaar is not liable for what your apps contain or do.`,
        ],
    },
    {
        title: "7. Acceptable use",
        body: [
            `You agree not to use Lunaar to build or distribute anything that is illegal, harmful, deceptive or infringing, including malware, phishing, spam or content that violates someone else's rights.`,
            `Do not try to reverse engineer, abuse or overload the service, or use it to access other people's accounts or data.`,
            `We may suspend or terminate accounts that break these rules.`,
        ],
    },
    {
        title: "8. Changes to these terms",
        body: [
            `Lunaar controls these terms and may change them at any time. When we do, we will update this page and revise the date above.`,
            `If a change is significant, we will try to let you know in advance, for example by email or a notice in the app. Continuing to use Lunaar after the changes take effect means you accept the updated terms.`,
        ],
    },
    {
        title: "9. Disclaimers",
        body: [
            `Lunaar is provided "as is" and "as available". AI-generated code and content may contain errors, so review what you build before using or publishing it.`,
            `We disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement.`,
        ],
    },
    {
        title: "10. Limitation of liability",
        body: [
            `To the maximum extent allowed by law, Lunaar and its founders and team will not be liable for any indirect, incidental, special or consequential damages — including lost profits, lost data or lost goodwill — arising from your use of the service.`,
            `Our total liability for any claim relating to the service will not exceed the amount you paid us in the twelve months before the claim.`,
        ],
    },
    {
        title: "11. Termination",
        body: [
            `You can stop using Lunaar and cancel your plan at any time. We may suspend or end your access if you breach these terms.`,
            `Sections covering payments, your apps and content, disclaimers and limitation of liability survive termination.`,
        ],
    },
    {
        title: "12. Contact",
        body: [
            `Questions about these terms? Reach out to us at hello@lunaar.online and we will get back to you.`,
        ],
    },
]

export default function Terms() {
    return (
        <div style={s.page}>
            <div style={s.bar}>
                <Link href="/" style={s.brand}>Lunaar</Link>
                <Link href="/" style={s.back}>Back to home</Link>
            </div>

            <main style={s.wrap}>
                <h1 style={s.h1}>Terms of Service</h1>
                <p style={s.lead}>
                    The rules for using Lunaar. Please read them carefully.
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
                    By using Lunaar you confirm that you have read, understood and agree to these terms.
                </p>

                <hr style={s.divider} />
                <p style={s.foot}>
                    Back to the <Link href="/docs" style={{ color: "#a39b8f" }}>Docs</Link>, or read our{" "}
                    <Link href="/privacy" style={{ color: "#a39b8f" }}>Privacy</Link> and{" "}
                    <Link href="/pricing" style={{ color: "#a39b8f" }}>Pricing</Link> pages.
                </p>
            </main>
        </div>
    )
}