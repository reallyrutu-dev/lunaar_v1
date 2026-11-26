import { NextResponse } from "next/server"
import Razorpay from "razorpay"

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
})

const ALLOWED_PLANS = [
    "plan_U3dKlPyfdwrnEL", // Vibe
    "plan_U3dNnGamHTwgpM", // Max
    "plan_U3dRTyHsvdar3o", // Studio
]

export async function POST(req) {
    try {
        const { user_id, plan_id } = await req.json()

        if (!user_id || !plan_id) {
            return NextResponse.json({ error: "Missing user_id or plan_id" }, { status: 400 })
        }

        if (!ALLOWED_PLANS.includes(plan_id)) {
            return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
        }

        const subscription = await razorpay.subscriptions.create({
            plan_id,
            customer_notify: 1,
            total_count: 12, 
            notes: { userId: user_id, planId: plan_id },
        })

        return NextResponse.json(subscription)
    } catch (e) {
        console.error("create_subscription error:", e)
        return NextResponse.json(
            { error: e?.error?.description || e?.message || "Failed to create subscription" },
            { status: 500 }
        )
    }
}