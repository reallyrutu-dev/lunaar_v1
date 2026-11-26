import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUser, sign } from "../../../libs/github.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = crypto.randomBytes(16).toString("hex");
  const payload = `${state}.${user.id}`;

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${process.env.APP_URL}/api/github/callback`);
  url.searchParams.set("scope", "repo workflow");
  url.searchParams.set("scope", "repo workflow");
  url.searchParams.set("state", state);

  const res = NextResponse.json({ url: url.toString() });
  res.cookies.set("gh_state", `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}