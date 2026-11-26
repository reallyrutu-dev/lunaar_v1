import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const MGMT = "https://api.supabase.com/v1";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

function key() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string) {
  const buf = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export async function getAccessToken(userId: string) {
  const db = admin();
  const { data: row, error } = await db
    .from("supabase_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !row) throw new Error("Supabase account is not connected");

  const expiresSoon = new Date(row.expires_at).getTime() - Date.now() < 60 * 1000;
  if (!expiresSoon) return decrypt(row.access_token);

  const basic = Buffer.from(
    `${process.env.SUPABASE_OAUTH_CLIENT_ID}:${process.env.SUPABASE_OAUTH_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${MGMT}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refresh_token),
    }),
  });

  if (!res.ok) throw new Error("Supabase connection expired, please reconnect");

  const tokens = await res.json();

  await db
    .from("supabase_connections")
    .update({
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId);

  return tokens.access_token as string;
}

async function mgmt(userId: string, path: string, init: RequestInit = {}) {
  const token = await getAccessToken(userId);
  const res = await fetch(`${MGMT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listProjects(userId: string) {
  const projects = await mgmt(userId, "/projects");
  return (projects as { id: string; name: string; region: string; status: string }[]).map((p) => ({
    ref: p.id,
    name: p.name,
    region: p.region,
    status: p.status,
  }));
}

export async function getSelectedProjectRef(userId: string) {
  const { data } = await admin()
    .from("supabase_connections")
    .select("project_ref")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.project_ref as string | null) ?? null;
}

export async function getProjectRef(userId: string) {
  const ref = await getSelectedProjectRef(userId);
  if (!ref) throw new Error("No Supabase project selected");
  return ref;
}

export async function selectProject(userId: string, ref: string) {
  const projects = await listProjects(userId);
  if (!projects.some((p) => p.ref === ref)) throw new Error("Project not found in this account");
  const { error } = await admin()
    .from("supabase_connections")
    .update({ project_ref: ref })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ref };
}

export async function getProjectKeys(userId: string) {
  const ref = await getProjectRef(userId);
  const keys = await mgmt(userId, `/projects/${ref}/api-keys`);
  const anon = (keys as { name: string; api_key: string }[]).find((k) => k.name === "anon");
  if (!anon) throw new Error("Anon key not found");
  return { url: `https://${ref}.supabase.co`, anonKey: anon.api_key };
}

async function sql(userId: string, query: string) {
  const ref = await getProjectRef(userId);
  return mgmt(userId, `/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export async function getSchema(userId: string) {
  const rows = await sql(
    userId,
    `select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default,
            coalesce(t.rowsecurity, false) as rls_enabled
     from information_schema.columns c
     left join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
     where c.table_schema = 'public'
     order by c.table_name, c.ordinal_position`
  );

  const tables: Record<string, { rls: boolean; columns: object[] }> = {};
  for (const r of rows as Record<string, any>[]) {
    if (!tables[r.table_name]) tables[r.table_name] = { rls: r.rls_enabled, columns: [] };
    tables[r.table_name].columns.push({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === "YES",
      default: r.column_default,
    });
  }
  return tables;
}

const DESTRUCTIVE =
  /\b(drop\s+(table|schema|database|policy|function|trigger)|truncate|alter\s+table\s+\S+\s+drop|delete\s+from\s+\S+\s*(;|$))/i;

const WRITE_FORBIDDEN =
  /\b(pg_catalog|create\s+extension|alter\s+role|create\s+role|grant|revoke)\b|\b(insert\s+into|update|delete\s+from|alter\s+table|drop\s+table|truncate(\s+table)?|create\s+table(\s+if\s+not\s+exists)?)\s+(auth|storage)\./i;

const READ_FORBIDDEN = /\b(auth|storage|pg_catalog|information_schema)\.|\bpg_\w+/i;

export function validateSql(query: string) {
  if (WRITE_FORBIDDEN.test(query)) return "Statement touches a restricted area";
  const created = (query.match(/create\s+table\s+(if\s+not\s+exists\s+)?/gi) || []).length;
  const secured = (query.match(/enable\s+row\s+level\s+security/gi) || []).length;
  if (created > secured) return "Every created table must enable row level security";
  return null;
}

export async function runMigration(
  userId: string,
  query: string,
  approved = false,
  allowDestructive = false
) {
  const problem = validateSql(query);
  if (problem) return { status: "rejected", reason: problem };

  const destructive = DESTRUCTIVE.test(query);
  if (!approved || (destructive && !allowDestructive)) {
    return { status: "needs_approval", destructive, sql: query };
  }

  const result = await sql(userId, query);
  return { status: "executed", result };
}

export async function queryRows(userId: string, query: string) {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  if (!/^select\b/i.test(trimmed) || trimmed.includes(";")) {
    throw new Error("Only a single select statement is allowed");
  }
  if (READ_FORBIDDEN.test(trimmed)) throw new Error("Query touches a restricted area");
  return sql(userId, `select * from (${trimmed}) as q limit 100`);
}