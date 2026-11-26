import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function encrypt(plain: string) {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(hex, "hex"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const fail = (reason: string, detail?: unknown) => {
    console.error("callback failed:", reason, detail ?? "");
    return NextResponse.redirect(`${appUrl}/dashboard?supabase=failed`);
  };

  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (!code || !state) return fail("missing code or state");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;

    if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !appUrl) {
      return fail("missing env", {
        url: !!supabaseUrl,
        serviceKey: !!serviceKey,
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        appUrl: !!appUrl,
      });
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: row, error: rowError } = await db
      .from("supabase_oauth_states")
      .select("user_id, verifier, created_at")
      .eq("state", state)
      .maybeSingle();

    if (rowError) return fail("state lookup error", rowError);
    if (!row) return fail("state row not found");

    await db.from("supabase_oauth_states").delete().eq("state", state);

    if (Date.now() - new Date(row.created_at).getTime() > 10 * 60 * 1000) {
      return fail("state expired");
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch("https://api.supabase.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/supabase/callback`,
        code_verifier: row.verifier,
      }),
    });

    if (!res.ok) return fail("token exchange", { status: res.status, body: await res.text() });

    const tokens = await res.json();

    const { error } = await db.from("supabase_connections").upsert({
      user_id: row.user_id,
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    if (error) return fail("saving connection", error);

    return NextResponse.redirect(`${appUrl}/dashboard?supabase=connected`);
  } catch (e) {
    return fail("unexpected", e);
  }
}