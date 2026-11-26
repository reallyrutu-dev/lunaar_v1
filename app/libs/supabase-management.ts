
const BASE = "https://api.supabase.com/v1";

async function call(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const listProjects = (token: string) => call(token, "/projects");

export const listOrganizations = (token: string) => call(token, "/organizations");

export const createProject = (
  token: string,
  body: { name: string; organization_id: string; db_pass: string; region: string }
) => call(token, "/projects", { method: "POST", body: JSON.stringify(body) });

export const runSql = (token: string, ref: string, query: string) =>
  call(token, `/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });

export async function getProjectKeys(token: string, ref: string) {
  const keys = await call(token, `/projects/${ref}/api-keys`);
  const anon = keys.find((k: { name: string }) => k.name === "anon");
  return {
    url: `https://${ref}.supabase.co`,
    anonKey: anon?.api_key as string,
  };
}