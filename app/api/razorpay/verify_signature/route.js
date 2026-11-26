import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import supabase from "../../../utils/supabase"
import crypto from "crypto"
import Razorpay from 'razorpay';

export async function POST(req){

 const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

 const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest('hex')

  if (generatedSignature === razorpay_signature) {
    res.json({ status: 'success', message: 'Subscription verified' });
  } else {
    res.status(400).json({ status: 'failure', message: 'Invalid signature' });
  }

}