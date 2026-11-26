import { getOctokit } from "../../libs/github.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const friendly = (err) => {
    if (err?.status === 401) {
        return "GitHub connection is invalid. Reconnect GitHub from the dashboard."
    }
    return err?.message || "GitHub request failed"
}

const resolveRepo = async (octokit, repo) => {
    if (repo.includes("/")) {
        const [owner, name] = repo.split("/")
        return { owner, name }
    }
    const { data } = await octokit.rest.users.getAuthenticated()
    return { owner: data.login, name: repo }
}

const pickBranch = async (octokit, owner, repo, wanted) => {
    const { data } = await octokit.rest.repos.get({ owner, repo })
    if (!wanted || wanted === data.default_branch) return data.default_branch
    try {
        await octokit.rest.repos.getBranch({ owner, repo, branch: wanted })
        return wanted
    } catch (e) {
        if (e.status === 404) return data.default_branch
        throw e
    }
}

const getHeadRef = async (octokit, owner, repo, branch) => {
    let last
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const { data } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` })
            return data
        } catch (e) {
            last = e
            if (e.status !== 404 && e.status !== 409) throw e
            await wait(800)
        }
    }
    throw last
}

export async function createRepo(user_id, { name, description = "", isPrivate = true }) {
    try {
        const { octokit } = await getOctokit(user_id)
        for (let attempt = 0; attempt < 3; attempt++) {
            const repoName = attempt === 0 ? name : `${name}-${Math.random().toString(36).slice(2, 6)}`
            try {
                const { data } = await octokit.rest.repos.createForAuthenticatedUser({
                    name: repoName,
                    description,
                    private: isPrivate,
                    auto_init: true,
                })
                return {
                    repo: data.full_name,
                    fullName: data.full_name,
                    url: data.html_url,
                    branch: data.default_branch,
                }
            } catch (e) {
                if (e.status !== 422 || attempt === 2) throw e
            }
        }
    } catch (err) {
        return { error: friendly(err) }
    }
}

export const pushFiles = async (user_id, { repo, files, message = "Update project", branch }) => {
    try {
        const { octokit } = await getOctokit(user_id)
        const { owner, name } = await resolveRepo(octokit, repo)
        const targetBranch = await pickBranch(octokit, owner, name, branch)

        const ref = await getHeadRef(octokit, owner, name, targetBranch)
        const parentSha = ref.object.sha

        const { data: parent } = await octokit.rest.git.getCommit({
            owner,
            repo: name,
            commit_sha: parentSha,
        })

        const tree = []
        for (let i = 0; i < files.length; i += 10) {
            const created = await Promise.all(
                files.slice(i, i + 10).map(async (file) => {
                    const { data: blob } = await octokit.rest.git.createBlob({
                        owner,
                        repo: name,
                        content: Buffer.from(file.content, "utf-8").toString("base64"),
                        encoding: "base64",
                    })
                    return { path: file.path, mode: "100644", type: "blob", sha: blob.sha }
                })
            )
            tree.push(...created)
        }

        const { data: newTree } = await octokit.rest.git.createTree({
            owner,
            repo: name,
            base_tree: parent.tree.sha,
            tree,
        })

        const { data: commit } = await octokit.rest.git.createCommit({
            owner,
            repo: name,
            message,
            tree: newTree.sha,
            parents: [parentSha],
        })

        await octokit.rest.git.updateRef({
            owner,
            repo: name,
            ref: `heads/${targetBranch}`,
            sha: commit.sha,
        })

        return {
            commit: commit.sha,
            url: commit.html_url ?? `https://github.com/${owner}/${name}/commit/${commit.sha}`,
        }
    } catch (err) {
        return { error: friendly(err) }
    }
}