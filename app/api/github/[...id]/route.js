import { NextResponse } from "next/server";
import supabase from "../../../utils/supabase";

export async function GET(req, { params }) {
  const { id } = await params;
  const [user_id, chat_id] = id || [];

  if (!user_id || !chat_id) {
    return NextResponse.json({ error: "Missing user_id or chat_id" }, { status: 400 });
  }

  try {
    const { data: connection, error: tokenError } = await supabase
      .from("github_connections")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!connection || tokenError) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = connection.access_token;

    const { data: repoData, error: repoError } = await supabase
      .from("chats")
      .select("repo_url")
      .eq("id", chat_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (!repoData?.repo_url || repoError) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const cleanPath = repoData.repo_url
      .replace("https://github.com", "")
      .replace(/\.git$/, "")
      .replace(/^\/|\/$/g, "");
    const [owner, repo] = cleanPath.split("/");

    if (!owner || !repo) {
      return NextResponse.json({ error: "Invalid repo_url format" }, { status: 400 });
    }

    const url = `https://github.com{owner}/${repo}/commits?per_page=100`;

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json(data);

  } catch (e) {
    console.error("Commit fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
  }
}
