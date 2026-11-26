import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLANS = {
  [process.env.RAZORPAY_VIBE_PLAN]: { name: "Vibe", tokens: 2000000 },
  [process.env.RAZORPAY_SUPER_PLAN]: { name: "Super", tokens: 10000000 },
  [process.env.RAZORPAY_STUDIO_PLAN]: { name: "Studio", tokens: 25000000 }
}

function validSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function setStatus(userId, status) {
  const { error } = await supabase
    .from("profiles")
    .update({ subscription_status: status })
    .eq("id", userId)
  return error
}

export async function POST(req) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-razorpay-signature")

  if (!validSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
    console.error("Invalid webhook signature")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const eventType = event.event
  const eventId = req.headers.get("x-razorpay-event-id")
  const subscription = event.payload?.subscription?.entity
  const subscriptionId = subscription?.id
  const userId = subscription?.notes?.userId

  console.log(`Received webhook event: ${eventType} for ${subscriptionId}`)

  if (!subscription || !userId) {
    return NextResponse.json({ status: "ignored" }, { status: 200 })
  }

  let error = null

  switch (eventType) {
    case "subscription.charged": {
      const plan = PLANS[subscription.plan_id]
      if (!plan) {
        console.error("Unknown plan_id", subscription.plan_id)
        return NextResponse.json({ status: "ignored" }, { status: 200 })
      }
      if (!eventId) {
        return NextResponse.json({ error: "Missing event id" }, { status: 400 })
      }
      const res = await supabase.rpc("apply_subscription_charge", {
        p_event_id: eventId,
        p_user_id: userId,
        p_plan: plan.name,
        p_tokens: plan.tokens,
        p_subscription_id: subscriptionId
      })
      error = res.error
      break
    }
    case "subscription.halted":
      error = await setStatus(userId, "Halted")
      break
    case "subscription.cancelled":
      error = await setStatus(userId, "canceled")
      break
    default:
      console.log(`Unhandled event: ${eventType}`)
  }

  if (error) {
    console.error("Webhook DB error", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ status: "ok" }, { status: 200 })
}