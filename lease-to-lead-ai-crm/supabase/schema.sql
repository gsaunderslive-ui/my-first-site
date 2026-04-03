-- Unified CRM + Messaging schema (app-compatible, scalable)

create extension if not exists pgcrypto;

-- Clean up legacy constraints that caused prior migration failures
alter table if exists tenants drop constraint if exists tenants_stage_check;

create table if not exists tenants (
  id text primary key,
  name text not null,
  phone text not null,
  email text,

  unit_address text,
  monthly_rent integer,
  lease_start timestamptz,
  lease_end timestamptz,
  credit_score integer,
  on_time_status text,

  -- Existing app fields (kept for compatibility)
  lease_start_date timestamptz,
  lease_end_date timestamptz,
  rent_amount integer,
  estimated_income integer,
  credit_score_range text,
  status text not null default 'Cold',
  stage text not null default 'COLD',
  engagement_score integer not null default 0,
  consent_status boolean not null default true,
  lead_score integer not null default 0,
  assigned_agent boolean not null default false,
  assigned_agent_name text,
  assigned_agent_email text,
  last_message_sent text not null default '',
  next_scheduled_message text not null default '',
  engagement_status text not null default 'No Response',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_phone_idx on tenants(phone);
create index if not exists tenants_stage_idx on tenants(stage);
create index if not exists tenants_engagement_score_idx on tenants(engagement_score desc);

create table if not exists chats (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  control_mode text not null default 'ai' check (control_mode in ('ai', 'human')),
  last_message text,
  channel text not null default 'sms',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chats_tenant_unique_idx on chats(tenant_id);
create index if not exists chats_created_at_idx on chats(created_at desc);

create table if not exists messages (
  id text primary key,
  chat_id text not null references chats(id) on delete cascade,
  tenant_id text not null references tenants(id) on delete cascade,
  content text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  sender text not null default 'ai' check (sender in ('ai', 'human')),
  status text not null default 'sent',
  metadata jsonb not null default '{}'::jsonb,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_chat_id_idx on messages(chat_id);
create index if not exists messages_tenant_id_idx on messages(tenant_id);
create index if not exists messages_created_at_idx on messages(created_at asc);
create index if not exists messages_provider_message_id_idx on messages(provider_message_id);

create table if not exists message_events (
  id text primary key,
  message_id text references messages(id) on delete cascade,
  tenant_id text not null references tenants(id) on delete cascade,
  timestamp timestamptz not null default now(),
  channel text,
  action text,
  outcome text,
  score_delta integer not null default 0,
  content text,
  external_id text
);

create index if not exists message_events_tenant_id_idx on message_events(tenant_id);
create index if not exists message_events_message_id_idx on message_events(message_id);
create index if not exists message_events_timestamp_idx on message_events(timestamp desc);

create table if not exists workflow_events (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_events_tenant_id_idx on workflow_events(tenant_id);
create index if not exists workflow_events_created_at_idx on workflow_events(created_at desc);

create table if not exists activities (
  id text primary key,
  timestamp timestamptz not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_timestamp_idx on activities(timestamp desc);

create table if not exists notifications (
  id text primary key,
  timestamp timestamptz not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_timestamp_idx on notifications(timestamp desc);

-- Non-destructive upgrades for pre-existing tables
alter table chats add column if not exists control_mode text not null default 'ai';
alter table chats add column if not exists channel text not null default 'sms';
alter table chats add column if not exists status text not null default 'open';
alter table chats add column if not exists updated_at timestamptz not null default now();

alter table messages add column if not exists sender text not null default 'ai';
alter table messages add column if not exists status text not null default 'sent';
alter table messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table messages add column if not exists provider_message_id text;
alter table messages add column if not exists updated_at timestamptz not null default now();

alter table tenants add column if not exists unit_address text;
alter table tenants add column if not exists monthly_rent integer;
alter table tenants add column if not exists lease_start timestamptz;
alter table tenants add column if not exists lease_end timestamptz;
alter table tenants add column if not exists credit_score integer;
alter table tenants add column if not exists on_time_status text;
alter table tenants add column if not exists updated_at timestamptz not null default now();

-- CRM v2: pre-approval, buying power, lead score inputs, automation, last touch
alter table tenants add column if not exists pre_approval_status text not null default 'none';
alter table tenants add column if not exists estimated_credit_score integer;
alter table tenants add column if not exists estimated_buying_power integer;
alter table tenants add column if not exists last_interaction_at timestamptz;
alter table tenants add column if not exists automation_enabled boolean not null default true;
alter table tenants add column if not exists automation_interval_hours integer;

-- Chat: assisted mode + human touch timestamp (24h revert to automated)
alter table chats add column if not exists last_human_interaction_at timestamptz;

-- Unified thread: channel per message (sms, email, in_app)
alter table messages add column if not exists channel text not null default 'sms';

-- ---------------------------------------------------------------------------
-- CRM app users, company playbooks, update queue (auth + workflow settings)
-- ---------------------------------------------------------------------------

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Company',
  created_at timestamptz not null default now()
);

create table if not exists crm_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_users_company_idx on crm_users(company_id);

alter table crm_users add column if not exists display_name text;
alter table crm_users add column if not exists email text;
alter table crm_users add column if not exists agent_role text not null default 'General';
alter table crm_users add column if not exists agent_status text not null default 'Active';

create table if not exists company_playbooks (
  company_id uuid primary key references companies(id) on delete cascade,
  defaults jsonb not null default '{}'::jsonb,
  source_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists playbook_update_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposed_by_user_id uuid references crm_users(id) on delete set null,
  section_path text not null,
  proposed_content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now()
);

create index if not exists playbook_update_queue_company_status_idx on playbook_update_queue(company_id, status);

create table if not exists chat_user_state (
  user_id uuid not null references crm_users(id) on delete cascade,
  chat_id text not null references chats(id) on delete cascade,
  suppress_auto_summary boolean not null default false,
  has_taken_control_before boolean not null default false,
  primary key (user_id, chat_id)
);

-- Visual playbook builder (React Flow) + execution sessions — see migrations/20260331180000_visual_playbook_workflows.sql
