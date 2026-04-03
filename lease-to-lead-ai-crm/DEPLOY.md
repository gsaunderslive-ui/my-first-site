# Deploy checklist (Supabase + Vercel)

Do these once per environment (e.g. Production). I can’t access your accounts from the repo—this is the exact order to run on your machine.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL → New query** → paste and run the full file [`supabase/schema.sql`](./supabase/schema.sql) → Run.
3. If you ever created the DB before team fields existed, also run [`supabase/migrations/20260331120000_crm_users_team_fields.sql`](./supabase/migrations/20260331120000_crm_users_team_fields.sql) (safe to run if columns already exist).
4. **Visual playbook (SMS workflow graph):** run [`supabase/migrations/20260331180000_visual_playbook_workflows.sql`](./supabase/migrations/20260331180000_visual_playbook_workflows.sql) in the SQL editor. Without these tables, **Settings → Visual playbook** cannot save workflows. After deploy, open that page, create a workflow, click **Set active**. When **exactly one** workflow has `is_active = true` for your company, **inbound and outbound SMS** use that graph (node `message_prompt`s + `lib/visualPlaybook/openaiRender.ts`). If **no** workflow is active, the app keeps using the JSON **Company playbook** under Settings → Company playbook (JSON).
5. **Project Settings → API**: copy `URL`, `anon` `public`, and `service_role` keys (keep service role secret).

## 2. Vercel (from your machine — **no GitHub required**)

You can keep deploying the way you already do: **upload from here** using the Vercel CLI, without linking GitHub.

### One-time: Vercel project + env vars

1. Install CLI (if needed): `npm i -g vercel` **or** use `npx vercel` (no global install).
2. From this folder (`lease-to-lead-ai-crm`), run:
   ```bash
   npx vercel login
   npx vercel link
   ```
   Pick your team and either create a new project or link an existing one. If your local folder is only the CRM app, you don’t need a “root directory” override—Vercel uses this directory as the app root.
3. In **[vercel.com](https://vercel.com) → your project → Settings → Environment Variables**, add **Production** (and Preview if you want) variables:

| Name | Value |
|------|--------|
| `CRM_SESSION_SECRET` | Random string, **≥32 characters** |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CRM_ADMIN_USERNAMES` | e.g. `admin` (comma-separated for multiple) |
| `CRM_ADMIN_INITIAL_PASSWORD` | Strong password (only used to create missing admin rows) |
| `CRM_COMPANY_NAME` | Optional, e.g. `My Company` |

Optional: Twilio, OpenAI, `CRM_SIMULATE_INBOUND_ENABLED` (see `.env.example`).

4. Env vars are read on the server at **deploy time** for the build and at **runtime** for functions—after you change them in the dashboard, run **one more deploy** from the CLI (below) so new builds pick everything up.

### Every time you want to go live

From `lease-to-lead-ai-crm`:

```bash
npm run deploy
```

That runs `vercel --prod` (production deploy of **current files on disk**, same as you’ve been doing). No GitHub connection needed.

**Optional:** If you ever want push-to-deploy, you can **add** a Git connection in Vercel later—it’s not required for CLI deploys.

### About “automatic” deploys from Cursor

The assistant can run `npm run deploy` **when you ask** and approve the command (network access, your logged-in Vercel session). It does **not** deploy on its own on every save—that still needs a deliberate deploy from your machine or a linked Git integration.

## 3. Twilio (if using real SMS)

- Inbound webhook: `https://YOUR_DOMAIN/api/webhooks/twilio`
- Status callback: same base URL if you use `TWILIO_STATUS_CALLBACK_URL`

## 4. Verify after deploy

1. Open `https://YOUR_DOMAIN/login`.
2. Sign in with a username from `CRM_ADMIN_USERNAMES` and `CRM_ADMIN_INITIAL_PASSWORD`.
3. **Settings → Change password** immediately.
4. **Settings → Team** and **Company playbook** as needed.
5. Optional: `GET https://YOUR_DOMAIN/api/diagnostics/supabase`

## 5. Local check before you paste env into Vercel

From `lease-to-lead-ai-crm`, with the same variables exported in your shell (or after sourcing `.env.local`):

```bash
npm run verify:deploy
```

Exits `0` only if required production variables are present.

## CI (optional)

You can add a GitHub Action that runs `npm ci && npm run build` on push; it does **not** deploy to Vercel unless you add a separate deploy step with `VERCEL_TOKEN`.
