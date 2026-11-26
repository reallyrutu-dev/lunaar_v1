"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../auth/AuthContext"
import supabase from "../utils/supabase_browser"
import { MoveLeft, Coins, Check } from "lucide-react"
import styles from "./subscription.module.css"

const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js"

const features = (tokens, apps) => [
    `${tokens} million tokens`,
    `Up to ${apps} apps (approx. 50k tokens per app)`,
    "Priority customer care",
    "Everything in Free",
]

const PLANS = [
    {
        plan_id: "plan_U3dKlPyfdwrnEL",
        name: "Vibe",
        price: 199,
        usd: "2.14",
        features: features(3, "50+"),
    },
    {
        plan_id: "plan_U3dNnGamHTwgpM",
        name: "Max",
        price: 499,
        usd: "5.37",
        features: features(10, "200"),
    },
    {
        plan_id: "plan_U3dRTyHsvdar3o",
        name: "Studio",
        price: 999,
        usd: "10.76",
        features: features(25, "500"),
    },
]

const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if (window.Razorpay) {
            resolve(true)
            return
        }

        const existingScript = document.querySelector(`script[src="${RAZORPAY_SRC}"]`)
        if (existingScript) {
            existingScript.addEventListener("load", () => resolve(true))
            existingScript.addEventListener("error", () => resolve(false))
            return
        }

        const script = document.createElement("script")
        script.src = RAZORPAY_SRC
        script.async = true
        script.onload = () => resolve(true)
        script.onerror = () => resolve(false)
        document.body.appendChild(script)
    })
}

export default function Page() {
    const router = useRouter()
    const { user, loading } = useAuth()
    const [profile, setProfile] = useState(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!loading && !user) router.replace("/auth")
    }, [loading, user, router])

    const loadProfile = useCallback(async () => {
        if (!user) return

        const { data, error } = await supabase
            .from("profiles")
            .select("remaining_tokens, plan_id, status")
            .eq("id", user.id)
            .maybeSingle()

        if (error) console.log(error)
        if (data) setProfile(data)
    }, [user])

    useEffect(() => {
        loadProfile()
    }, [loadProfile])

    const goBack = () => {
        if (window.history.length > 1) router.back()
        else router.push("/dashboard")
    }

    const Create_subscription = async (plan_id) => {
        if (busy) return
        setBusy(true)

        try {
            const isLoaded = await loadRazorpayScript()
            if (!isLoaded || !window.Razorpay) {
                alert("Razorpay SDK failed to load. Check your internet connection or disable ad blockers.")
                setBusy(false)
                return
            }

            const res = await fetch("/api/razorpay/create_subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, plan_id }),
})

const subscription = await res.json().catch(() => ({}))

if (!res.ok || !subscription.id) {
    alert(subscription.error || `Could not start the subscription (HTTP ${res.status}).`)
    setBusy(false)
    return
}
            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                subscription_id: subscription.id,
                name: "Lunaar",
                description: "Monthly Plan",
                prefill: {
                    email: user.email,
                },
                modal: {
                    ondismiss: () => setBusy(false),
                },
                handler: async function (response) {
                    try {
                        const verifyRes = await fetch("/api/razorpay/verify_subscription", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_subscription_id: response.razorpay_subscription_id,
                                razorpay_signature: response.razorpay_signature,
                            }),
                        })
                        const result = await verifyRes.json()
                        alert(result.message)

                        if (verifyRes.ok) await loadProfile()
                    } catch (err) {
                        console.log(err)
                        alert("Payment received, but verification failed. If your plan doesn't update shortly, contact support.")
                    } finally {
                        setBusy(false)
                    }
                },
            }

            const rzp = new window.Razorpay(options)
            rzp.on("payment.failed", (resp) => {
                console.log(resp.error)
                alert(resp.error?.description || "Payment failed. Please try again.")
                setBusy(false)
            })
            rzp.open()
        } catch (err) {
            console.log(err)
            alert("Something went wrong. Please try again.")
            setBusy(false)
        }
        // When checkout opens successfully, busy is released by ondismiss / handler / payment.failed.
    }

    if (loading || !user) return null

    const active_plan = profile?.status === "active" ? profile.plan_id : null

    return (
        <div className={styles.wrapper}>
            <div className={styles.panel}>
                <div className={styles.nav}>
                    <button className={styles.back_btn} onClick={goBack} aria-label="Go back">
                        <MoveLeft size={20} />
                    </button>
                    <div className={styles.credit}>
                        <Coins size={16} />
                        <span>{(profile?.remaining_tokens ?? 0).toLocaleString()}</span>
                    </div>
                </div>

                <div className={styles.Main_content}>
                    <h2>Plans That Scale With Your Vibe</h2>
                    <p className={styles.up_span}>
                        Upgrade to unlock more tokens, more apps and more space to build your app.
                    </p>

                    <div className={styles.plans}>
                        {PLANS.map((plan) => {
                            const current = active_plan === plan.plan_id

                            return (
                                <div
                                    key={plan.plan_id}
                                    className={`${styles.plan_card} ${current ? styles.plan_current : ""}`}
                                >
                                    <div className={styles.plan_head}>
                                        <h3>{plan.name}</h3>
                                        {current && <span className={styles.current_tag}>Current plan</span>}
                                    </div>

                                    <div className={styles.price}>
                                        <span className={styles.amount}>₹{plan.price}</span>
                                        <span className={styles.per}>/ month</span>
                                    </div>
                                    <span className={styles.usd}>≈ ${plan.usd}</span>

                                    <button
                                        type="button"
                                        className={styles.subscribe_btn}
                                        disabled={current || busy}
                                        onClick={() => Create_subscription(plan.plan_id)}
                                    >
                                        {current ? "Subscribed" : busy ? "Please wait..." : "Subscribe"}
                                    </button>

                                    <div className={styles.divider} />

                                    <h4 className={styles.f}>Includes</h4>
                                    <ul className={styles.features}>
                                        {plan.features.map((feature) => (
                                            <li key={feature}>
                                                <Check size={15} strokeWidth={2} />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )
                        })}
                    </div>

                    <p className={styles.footnote}>Billed monthly in INR. Dollar amounts are approximate.</p>
                </div>
            </div>
        </div>
    )
}