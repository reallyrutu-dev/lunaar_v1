import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { sign } from "../../../libs/github.js";
import { supabaseAdmin } from "../../../utils/supabase.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookie = req.cookies.get("gh_state")?.value;

  const redirect = (reason) => {
    const res = NextResponse.redirect(`${process.env.APP_URL}/dashboard?github=${reason}`);
    res.cookies.delete("gh_state");
    return res;
  };

  if (!code || !state || !cookie) return redirect("invalid");

  const [cookieState, userId, sig] = cookie.split(".");
  if (cookieState !== state || sig !== sign(`${cookieState}.${userId}`)) return redirect("invalid");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${process.env.APP_URL}/api/github/callback`,
    }),
  });
  const { access_token, scope } = await tokenRes.json();
  if (!access_token) return redirect("failed");

  const granted = (scope || "").split(",").map((s) => s.trim());
  if (!granted.includes("workflow")) {
    console.error("github token missing workflow scope, granted:", scope);
    return redirect("scope");
  }

  const octokit = new Octokit({ auth: access_token });
  const { data: ghUser } = await octokit.rest.users.getAuthenticated();

  const { error } = await supabaseAdmin
    .from("github_connections")
    .upsert(
      { user_id: userId, access_token, github_login: ghUser.login },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("github_connections upsert failed:", error);
    return redirect("failed");
  }

  return redirect("connected");
}