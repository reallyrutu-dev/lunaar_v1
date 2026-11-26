
const RENDER_API = "https://api.render.com/v1"

const call = async (apiKey, path, options = {}) => {
    const res = await fetch(`${RENDER_API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    })
    const text = await res.text()
    let body = null
    try {
        body = text ? JSON.parse(text) : null
    } catch {
        body = { message: text }
    }
    if (!res.ok) throw new Error(body?.message || `Render API error ${res.status}`)
    return body
}

const slugify = (value) =>
    String(value || "backend")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "backend"

const getOwnerId = async (apiKey) => {
    const owners = await call(apiKey, "/owners?limit=20")
    const id = owners?.[0]?.owner?.id
    if (!id) throw new Error("No Render workspace found for this API key")
    return id
}

const getServiceUrl = async (apiKey, serviceId) => {
    for (let attempt = 0; attempt < 3; attempt++) {
        const data = await call(apiKey, `/services/${serviceId}`)
        const url = data.serviceDetails?.url
        if (url) return url
        await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return null
}

const createService = async (apiKey, { name, repoUrl, branch, rootDir, envVars }) => {
    const ownerId = await getOwnerId(apiKey)

    const body = {
        type: "web_service",
        name: slugify(name),
        ownerId,
        repo: repoUrl,
        branch,
        rootDir,
        autoDeploy: "yes",
        envVars: Object.entries(envVars)
            .filter(([, value]) => value !== undefined && value !== "")
            .map(([key, value]) => ({ key, value: String(value) })),
        serviceDetails: {
            runtime: "node",
            plan: "free",
            region: "oregon",
            healthCheckPath: "/health",
            envSpecificDetails: {
                buildCommand: "npm install",
                startCommand: "npm start",
            },
        },
    }

    const data = await call(apiKey, "/services", { method: "POST", body: JSON.stringify(body) })
    const service = data.service || data
    const url = service.serviceDetails?.url || (await getServiceUrl(apiKey, service.id))

    return {
        serviceId: service.id,
        url,
        deployId: data.deployId || null,
        created: true,
    }
}

const redeploy = async (apiKey, serviceId) => {
    const data = await call(apiKey, `/services/${serviceId}/deploys`, {
        method: "POST",
        body: JSON.stringify({ clearCache: "do_not_clear" }),
    })
    return { serviceId, url: null, deployId: data.id, created: false }
}

export const deployToRender = async (
    apiKey,
    { serviceId, name, repoUrl, branch = "main", rootDir = "backend", envVars = {} }
) => {
    if (serviceId) return redeploy(apiKey, serviceId)
    if (!repoUrl) throw new Error("repoUrl is required")
    return createService(apiKey, { name, repoUrl, branch, rootDir, envVars })
}

export const getDeployStatus = async (apiKey, serviceId, deployId) => {
    const data = await call(apiKey, `/services/${serviceId}/deploys/${deployId}`)
    return { status: data.status }
}