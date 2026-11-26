import { createClient } from "@supabase/supabase-js";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getUser(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getOctokit(userId) {
  const { data } = await supabaseAdmin
    .from("github_connections")
    .select("access_token, github_login")
    .eq("user_id", userId)
    .single();
  if (!data) throw Object.assign(new Error("GitHub not connected"), { status: 400 });
  return { octokit: new Octokit({ auth: data.access_token }), login: data.github_login };
}

export function sign(value) {
  return crypto
    .createHmac("sha256", process.env.GITHUB_STATE_SECRET)
    .update(value)
    .digest("hex");
}