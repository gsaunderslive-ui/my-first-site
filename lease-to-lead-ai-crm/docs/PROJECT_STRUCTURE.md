# Project Structure

This app is organized by responsibility so integration code is easier to find.

## Main Folders

- `app/` - Next.js App Router pages and API routes.
  - `app/login` - CRM sign-in.
  - `app/(crm)/*` - authenticated UI (middleware enforces session).
  - `app/api/auth/*` - login, logout, session (`/me`), change password.
  - `app/api/playbook*` - company playbook GET/PATCH and update queue.
  - `app/api/users` - list/create CRM users (admin).
  - `app/api/tenant/*` - tenant workflow actions.
  - `app/api/chats/*` - chat thread APIs.
  - `app/api/webhooks/twilio` - Twilio inbound + status webhook.
  - `app/api/testing/test-lead/*` - local test/simulation endpoints.
  - `app/api/diagnostics/*` - environment and integration diagnostics.
- `middleware.ts` - redirects unauthenticated traffic to `/login`; allows auth routes and `/api/webhooks/*`.
- `components/` - UI components used across pages.
- `lib/` - business logic and integrations.
  - `lib/services/` - service-oriented entry points used by API routes.
    - `tenantWorkflow.ts` - tenant workflow actions for API handlers.
    - `twilioWebhooks.ts` - Twilio inbound/status handlers.
    - `testLead.ts` - test-tenant creation and simulation flow.
  - `lib/store.ts` - core workflow orchestration and state lifecycle (internal engine).
  - `lib/chatDb.ts` - chat/message persistence.
  - `lib/twilio.ts` - Twilio send + phone normalization + demo mode.
  - `lib/supabaseAdmin.ts` - Supabase admin client setup.
  - `lib/crmSession.ts`, `lib/apiAuth.ts` - JWT session cookie and API guards.
  - `lib/crmUsersDb.ts`, `lib/crmBootstrap.ts` - CRM users and default company/playbook bootstrap.
  - `lib/playbookDb.ts`, `lib/playbookSchema.ts`, `lib/playbookMerge.ts` - playbook storage and merge rules.
  - `lib/openai.ts` - AI message generation/fallbacks.
- `supabase/schema.sql` - database schema and upgrades.
- `pages/api/webhooks/engagement.js` - legacy Pages Router webhook (kept for compatibility).

## Diagnostics Endpoints

- `GET /api/diagnostics/supabase`
- `GET /api/diagnostics/twilio`
- `GET /api/diagnostics/twilio?probe=1` (optional Twilio auth probe)

## Suggested Daily Workflow

1. Start app with `npm run dev`.
2. Check diagnostics first.
3. Run test lead simulation endpoints.
4. Validate messages in `/chats`.
