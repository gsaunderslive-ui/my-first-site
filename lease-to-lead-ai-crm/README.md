# Lease-to-Lead AI CRM (Demo)

SaaS-style demo CRM prototype for pitching tenant-to-buyer conversion workflows. The app includes **username/password sign-in**, **admin-managed users**, a **company playbook** (defaults + per-source overrides), and a **playbook update queue** (propose → admin approve).

## Run locally

1. Install Node.js 20+.
2. Install dependencies:
   - `npm install`
3. Copy env template:
   - `cp .env.example .env.local`
4. Add your API keys and CRM auth secrets in `.env.local` (see [Environment variables](#environment-variables)).
5. Create Supabase tables:
   - Run `supabase/schema.sql` in the Supabase SQL editor (tenants, chats, messages, CRM users, companies, `company_playbooks`, `playbook_update_queue`, etc.).
6. Start development server:
   - `npm run dev`
7. Open `http://localhost:3000` — you will be redirected to **`/login`** until you sign in.

### Main routes

| Path | UI name |
|------|---------|
| `/login` | Sign in |
| `/` | Control Panel (KPIs, workspace shortcuts, funnel) |
| `/communication` | **Active Tenants & Messages** — pipeline table, filters, and messaging on one screen |
| `/tenants` | Standalone Active Tenants (same table + modal; optional full-page focus) |
| `/follow-up` | Follow Up |
| `/automation` | Automation Engine |
| `/settings/workflows` | Company playbook (JSON: `defaults` + `source_overrides`) |
| `/settings/updates` | Playbook updates queue (propose / approve) |
| `/settings/users` | Redirects to Team (legacy URL) |
| `/settings/password` | Change password |
| `/settings/agents` | Team & logins (roster + CRM accounts) |

Legacy URLs: `/hot-leads` redirects to `/follow-up`. `/chats` is a client redirect to `/communication` (query string preserved).

Twilio is used for SMS; configure **Twilio** env vars and set the inbound/status webhook to `/api/webhooks/twilio`. Email + in-app channels are unified in the message store when those paths write to `messages` with a `channel` value.

## Integrations

- Vercel hosting: deploy this Next.js app and add env vars in Project Settings (then redeploy after changes).
- Supabase: tenants, activities, notifications, chats/messages, **CRM users**, **companies**, **playbooks**, and update queue.
- Twilio: outbound SMS and inbound/status webhooks.
- OpenAI: SMS copy (template fallback if key is missing).

## Environment variables

### Required for production sign-in

```env
# Min 32 characters; used to sign the session cookie. Rotating it logs everyone out.
CRM_SESSION_SECRET=

# Comma-separated admin usernames created on first bootstrap if rows are missing
CRM_ADMIN_USERNAMES=admin
# Initial password for those bootstrap admin accounts only
CRM_ADMIN_INITIAL_PASSWORD=

# Optional label for the default company row
CRM_COMPANY_NAME=My Company
```

### Supabase & integrations

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_STATUS_CALLBACK_URL=
TWILIO_DEMO_MODE=false

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

### Local development only

```env
# Never use in production — allows a fixed dev signing secret if CRM_SESSION_SECRET is unset
# AUTH_INSECURE_DEV=true

# Optional: sign in without Supabase (synthetic admin session for UI work)
# CRM_DEV_USERNAME=dev
# CRM_DEV_PASSWORD=
```

## Demo Mode (No Twilio Compliance Needed)

If you are not yet registered for A2P 10DLC or toll-free verification, you can still demo the SMS flow.

1. Set this in `.env.local`:
   - `TWILIO_DEMO_MODE=true`
2. Restart the app:
   - `npm run dev`
3. Use the app normally (engage via SMS). The app will:
   - generate message text via OpenAI (or fallback template)
   - simulate a successful Twilio send with a demo SID
   - log activity as `Demo SMS simulated ...`

You can keep Twilio credentials filled in, but they will not be called while demo mode is on.

## Webhook Endpoints

- Twilio webhook URL:
  - `/api/webhooks/twilio`
- Existing Ylopo webhook URL:
  - `/api/webhooks/engagement`

For production on Vercel, configure Twilio to post to:
- `https://<your-domain>/api/webhooks/twilio`

## Diagnostics Endpoints

- Supabase diagnostics:
  - `GET /api/diagnostics/supabase`
- Twilio readiness diagnostics:
  - `GET /api/diagnostics/twilio`
- Optional Twilio auth probe (tests account SID/token by fetching Twilio account):
  - `GET /api/diagnostics/twilio?probe=1`

## Database Setup (Supabase)

1. Open Supabase project SQL editor.
2. Run [`supabase/schema.sql`](./supabase/schema.sql).
3. If the DB existed before team fields were added, also run [`supabase/migrations/20260331120000_crm_users_team_fields.sql`](./supabase/migrations/20260331120000_crm_users_team_fields.sql).
4. Start the app. If `tenants` is empty, the app auto-seeds demo tenants.

## Deployment (Vercel)

Step-by-step: **[DEPLOY.md](./DEPLOY.md)** — includes **CLI deploy from your machine** (`npm run deploy` / `vercel --prod`) with **no GitHub connection required**. Linking Git to Vercel is optional if you want push-to-deploy later.

Summary:

1. `vercel link` once from `lease-to-lead-ai-crm`, set env vars in the Vercel dashboard.
2. Each release: `npm run deploy` (or ask Cursor to run it with network permission).
3. Twilio inbound URL: `https://<domain>/api/webhooks/twilio`.
4. Sign in at `/login`, then **Settings → Change password**.

Optional: GitHub Actions only runs a build check on push; it does not deploy.

## Notes

- Unauthenticated visitors are redirected to `/login`. API routes (except auth + webhooks) require a valid session cookie.
- If Supabase is not configured, the app can fall back to in-memory demo data; **login with database users requires Supabase** (or use `CRM_DEV_USERNAME` / `CRM_DEV_PASSWORD` for a dev-only session).
- If OpenAI is not configured, SMS copy falls back to a deterministic template.
- If Twilio is not configured, SMS attempts are logged but not sent.
- There is no email-based “forgot password”; use **Settings → Change password** or an admin-created account.
- See `docs/PROJECT_STRUCTURE.md` for a quick map of where integration code lives.
