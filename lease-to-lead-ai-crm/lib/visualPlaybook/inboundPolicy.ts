/**
 * STEP 1 — Source of truth for SMS / inbound conversation (MVP)
 *
 * When the company has exactly one **active** row in `visual_workflows`, that graph drives
 * inbound SMS (Twilio + CRM simulate-inbound) and the first **engage** SMS, including
 * OpenAI usage only as `renderPlaybookNodeMessage` (fixed script rewrite).
 *
 * If there is **no** active visual workflow, the legacy JSON **company playbook**
 * (`company_playbooks` + `workflowEngine.ts`) remains in effect.
 *
 * There is intentionally no extra env flag: presence of `is_active = true` selects the mode.
 */

export const VISUAL_PLAYBOOK_POLICY_VERSION = 1;
