#!/usr/bin/env node
/**
 * Create or update a Supabase Auth user and grant CMS admin (app_metadata.admin + admin_users row).
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from repo .env).
 *
 * Usage:
 *   node --env-file=.env scripts/register-supabase-admin.mjs --email user@example.com --password secret
 *
 * Do not commit real passwords; use strong secrets in production.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotenv() {
  const p = join(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { email: "", password: "" };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--email" && a[i + 1]) {
      out.email = a[++i];
    } else if (a[i] === "--password" && a[i + 1]) {
      out.password = a[++i];
    }
  }
  return out;
}

loadDotenv();

const { email: rawEmail, password } = parseArgs();
const email = (rawEmail || "").trim();
if (!email || !password) {
  console.error("Usage: node scripts/register-supabase-admin.mjs --email you@domain.com --password <secret>");
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const emailNorm = email.toLowerCase();

async function findUserByEmail() {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === emailNorm);
    if (hit) return hit;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAdminRow(userId) {
  const { error } = await supabase.from("admin_users").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (error) throw error;
}

async function main() {
  let user = await findUserByEmail();

  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...(user.app_metadata || {}), admin: true },
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log("Updated existing user:", user.email, "id:", user.id);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { admin: true },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created user:", user.email, "id:", user.id);
  }

  await ensureAdminRow(user.id);
  console.log("Granted admin_users row for:", user.id);
  console.log("Done. They can sign in at /admin with Supabase email/password.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
