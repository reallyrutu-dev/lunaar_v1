import { NextResponse } from "next/server"
import supabase from "../../utils/supabase"
import { pushFiles } from "../github/tools"
import { APK_WORKFLOW, WORKFLOW_FILE, WORKFLOW_PATH } from "./workflow"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const gh = (github_token, path, init = {}) =>
    fetch("https://api.github.com" + path, {
        ...init,
        headers: {
            Authorization: "Bearer " + github_token,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
        cache: "no-store",
    })

const fail = (error, status) => NextResponse.json({ error }, { status })

async function resolveContext(request, chat_id) {
    const bearer = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!bearer) return { error: fail("Unauthorized", 401) }

    const { data: auth, error: auth_err } = await supabase.auth.getUser(bearer)
    if (auth_err || !auth?.user) return { error: fail("Unauthorized", 401) }
    const user_id = auth.user.id

    if (!chat_id) return { error: fail("chat_id required", 400) }

    const [chatRes, connRes] = await Promise.all([
        supabase
            .from("chats")
            .select("repo_url, repo_full_name")
            .eq("id", chat_id)
            .eq("user_id", user_id)
            .maybeSingle(),
        supabase.from("github_connections").select("*").eq("user_id", user_id).maybeSingle(),
    ])

    const chat = chatRes.data
    const conn = connRes.data

    if (!chat?.repo_full_name && !chat?.repo_url) {
        return { error: fail("Create a GitHub repo for this chat first", 404) }
    }
    if (!conn?.access_token) return { error: fail("Github not connected", 400) }

    let owner
    let repo

    if (chat.repo_full_name?.includes("/")) {
        ;[owner, repo] = chat.repo_full_name.split("/")
    } else {
        const match = chat.repo_url?.match(/github\.com\/(?:repos\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
        if (match) {
            owner = match[1]
            repo = match[2]
        } else if (chat.repo_full_name && conn.github_login) {
            owner = conn.github_login
            repo = chat.repo_full_name
        }
    }

    if (!owner || !repo) return { error: fail("Could not work out the repo name", 400) }

    return { user_id, chat_id, github_token: conn.access_token, owner, repo }
}

async function latestRun(github_token, owner, repo) {
    const res = await gh(
        github_token,
        `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=1`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.workflow_runs?.[0] || null
}

async function findApk(github_token, owner, repo, run_number) {
    const res = await gh(github_token, `/repos/${owner}/${repo}/releases/tags/apk-${run_number}`)
    if (!res.ok) return null
    const release = await res.json()
    const asset = release.assets?.find((a) => a.name.endsWith(".apk"))
    return asset ? { id: asset.id, name: asset.name, size: asset.size} : null
}

async function tokenScopes(github_token) {
    const res = await gh(github_token, "/user")
    return res.headers.get("x-oauth-scopes") || "none reported"
}

async function ensureWorkflow(github_token, owner, repo, branch) {
    const existing = await gh(
        github_token,
        `/repos/${owner}/${repo}/contents/${WORKFLOW_PATH}?ref=${encodeURIComponent(branch)}`
    )

    let sha
    if (existing.ok) {
        const file = await existing.json()
        sha = file.sha
        const current = Buffer.from(file.content || "", "base64").toString("utf8")
        if (current === APK_WORKFLOW) return null
    }

    const put = await gh(github_token, `/repos/${owner}/${repo}/contents/${WORKFLOW_PATH}`, {
        method: "PUT",
        body: JSON.stringify({
            message: "Add APK build workflow",
            content: Buffer.from(APK_WORKFLOW).toString("base64"),
            branch,
            ...(sha ? { sha } : {}),
        }),
    })

    if (put.ok) return null

    const detail = await put.json().catch(() => ({}))
    const scopes = await tokenScopes(github_token)
    console.log("workflow write failed", put.status, detail.message, "scopes:", scopes)

    if (/workflow/i.test(detail.message || "") || !scopes.includes("workflow")) {
        return `Github needs the workflow permission (token scopes: ${scopes}). Disconnect and reconnect Github with the workflow scope, then try again.`
    }
    return `${detail.message || "Could not add the build workflow to the repo"} (status ${put.status})`
}

export async function GET(request) {
    const params = new URL(request.url).searchParams
    const ctx = await resolveContext(request, params.get("chat_id"))
    if (ctx.error) return ctx.error
    const { github_token, owner, repo } = ctx

    const run = await latestRun(github_token, owner, repo)
    if (!run) return NextResponse.json({ status: "none" })

    const asset =
        run.status === "completed" && run.conclusion === "success"
            ? await findApk(github_token, owner, repo, run.run_number)
            : null

    if (params.get("download")) {
        if (!asset) return fail("No APK is available yet", 404)

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
            headers: {
                Authorization: "Bearer " + github_token,
                Accept: "application/octet-stream",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            redirect: "manual",
        })

        const url = res.headers.get("location")
        if (!url) return fail("Could not get the download link", 502)
        return NextResponse.json({ url })
    }

    return NextResponse.json({
        status: run.status,
        conclusion: run.conclusion,
        run_url: run.html_url,
        run_number: run.run_number,
        created_at: run.created_at,
        asset,
    })
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}))
    const ctx = await resolveContext(request, body.chat_id)
    if (ctx.error) return ctx.error
    const { user_id, chat_id, github_token, owner, repo } = ctx

    const current = await latestRun(github_token, owner, repo)
    if (current && (current.status === "queued" || current.status === "in_progress")) {
        return fail("A build is already running", 409)
    }

    const repoRes = await gh(github_token, `/repos/${owner}/${repo}`)
    if (!repoRes.ok) {
        const detail = await repoRes.json().catch(() => ({}))
        console.log("repo lookup failed", repoRes.status, detail.message)
        return fail(`Could not open the repository: ${detail.message || repoRes.status}`, repoRes.status)
    }
    const { default_branch: branch } = await repoRes.json()

    const { data: files, error: files_err } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("user_id", user_id)
        .eq("chat_id", chat_id)

    if (files_err) return fail("Could not read the project files", 500)
    if (!files?.length) return fail("There are no project files to build yet", 400)

    let warning = ""
    try {
        const pushed = await pushFiles(user_id, {
            repo: `${owner}/${repo}`,
            message: "Update app",
            branch,
            files,
        })
        if (pushed?.error) warning = String(pushed.error)
    } catch (e) {
        warning = e?.message || "Could not push the latest files"
    }

    const workflow_error = await ensureWorkflow(github_token, owner, repo, branch)
    if (workflow_error) return fail(workflow_error, 403)

    let started = false
    let last_message = ""
    for (let attempt = 0; attempt < 4; attempt++) {
        const res = await gh(
            github_token,
            `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
            { method: "POST", body: JSON.stringify({ ref: branch }) }
        )
        if (res.status === 204) {
            started = true
            break
        }
        const detail = await res.json().catch(() => ({}))
        last_message = detail.message || ""
        await sleep(2000)
    }

    if (!started) return fail(last_message || "Could not start the build", 502)

    return NextResponse.json({ started: true, warning })
}