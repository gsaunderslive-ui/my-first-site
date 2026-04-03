#!/usr/bin/env node
/**
 * Validates that required production env vars are set (e.g. before/after pasting into Vercel).
 * Usage:
 *   cd lease-to-lead-ai-crm && node scripts/check-deploy-readiness.mjs
 *   # or load .env.local first:
 *   set -a && source .env.local 2>/dev/null; set +a && node scripts/check-deploy-readiness.mjs
 */

const checks = [
  {
    key: "CRM_SESSION_SECRET",
    required: true,
    minLen: 32,
    hint: "Random string, min 32 chars — signs session cookies"
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    hint: "Supabase project URL"
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    hint: "Service role key (server only)"
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    hint: "Anon key (public)"
  },
  {
    key: "CRM_ADMIN_USERNAMES",
    required: true,
    hint: "Comma-separated bootstrap admin usernames"
  },
  {
    key: "CRM_ADMIN_INITIAL_PASSWORD",
    required: true,
    hint: "Initial password for bootstrap admins only — change after first login"
  },
  {
    key: "CRM_COMPANY_NAME",
    required: false,
    hint: "Optional display name for default company row"
  },
  {
    key: "TWILIO_ACCOUNT_SID",
    required: false,
    hint: "Real SMS (omit or use TWILIO_DEMO_MODE=true for demos)"
  },
  {
    key: "OPENAI_API_KEY",
    required: false,
    hint: "Optional — templates work without it"
  },
  {
    key: "CRM_SIMULATE_INBOUND_ENABLED",
    required: false,
    hint: "true only if you want tenant-reply simulation on production"
  }
];

let failed = false;
console.log("Lease-to-Lead CRM — deploy env check\n");
console.log("(Reads process.env only. In Vercel, set these under Project → Settings → Environment Variables.)\n");

for (const c of checks) {
  const v = process.env[c.key];
  const present = v != null && String(v).trim() !== "";
  let ok = present;
  if (present && c.minLen && String(v).length < c.minLen) {
    ok = false;
  }
  const status = ok ? "OK" : c.required ? "MISSING" : "—";
  if (!ok && c.required) failed = true;
  const line = `[${status}] ${c.key}${present && c.minLen && !ok ? ` (need ≥${c.minLen} chars)` : ""}`;
  console.log(line);
  console.log(`      ${c.hint}\n`);
}

if (failed) {
  console.error("Fix required variables above, then redeploy.\n");
  process.exit(1);
}
console.log("All required production variables are present.\n");
process.exit(0);
