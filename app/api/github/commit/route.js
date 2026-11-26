import { NextResponse } from "next/server";
import { getUser, sign,getOcket } from "../../../libs/github.js";
export async function POST(req) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { octokit, login } = await getOctokit(user.id);
    const { owner = login, repo, files, message, branch = "main" } = await req.json();

    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const { data: baseCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: ref.object.sha,
    });

    const tree = await Promise.all(
      files.map(async (f) => {
        const { data: blob } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(f.content).toString("base64"),
          encoding: "base64",
        });
        return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
      })
    );

    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.tree.sha,
      tree,
    });
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [ref.object.sha],
    });
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return NextResponse.json({ commit: newCommit.sha });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}