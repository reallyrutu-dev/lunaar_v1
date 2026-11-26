import { NextResponse } from "next/server";
import { getUser, getOctokit } from "@/lib/github";

function fail(e) {
  if (e.status === 401) {
    return NextResponse.json({ error: "github_reconnect" }, { status: 409 });
  }
  return NextResponse.json({ error: e.message }, { status: e.status || 500 });
}

export async function GET(req) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { octokit } = await getOctokit(user.id);
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 50,
    });

    return NextResponse.json(
      data.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        url: r.html_url,
        private: r.private,
      }))
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, description, isPrivate = true } = await req.json();
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Repository name is required" }, { status: 400 });
    }

    const { octokit } = await getOctokit(user.id);
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name: name.trim(),
      description,
      private: isPrivate,
      auto_init: true,
    });

    return NextResponse.json({
      owner: data.owner.login,
      repo: data.name,
      url: data.html_url,
      branch: data.default_branch,
    });
  } catch (e) {
    return fail(e);
  }
}