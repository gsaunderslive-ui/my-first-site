-- Visual playbook: node-based workflows, edges, execution sessions (CRM)

create table if not exists visual_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  is_active boolean not null default false,
  entry_node_key text not null default 'start',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visual_workflows_company_idx on visual_workflows(company_id);
create index if not exists visual_workflows_company_active_idx on visual_workflows(company_id, is_active);

create table if not exists visual_workflow_nodes (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references visual_workflows(id) on delete cascade,
  node_key text not null,
  node_type text not null check (node_type in ('message', 'decision', 'action')),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  message_prompt text not null default '',
  condition_type text not null default 'any',
  condition_value text not null default '',
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, node_key)
);

create index if not exists visual_workflow_nodes_workflow_idx on visual_workflow_nodes(workflow_id);

create table if not exists visual_workflow_edges (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references visual_workflows(id) on delete cascade,
  source_key text not null,
  target_key text not null,
  condition_label text not null default 'next',
  match_type text not null default 'default'
    check (match_type in ('default', 'keyword_contains', 'keyword_any', 'intent_equals', 'always')),
  match_value text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists visual_workflow_edges_workflow_source_idx on visual_workflow_edges(workflow_id, source_key);

create table if not exists visual_workflow_sessions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references visual_workflows(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  subject_type text not null check (subject_type in ('tenant', 'test')),
  subject_id text not null,
  current_node_key text not null,
  lead_data jsonb not null default '{}'::jsonb,
  visit_path jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (workflow_id, subject_type, subject_id)
);

create index if not exists visual_workflow_sessions_workflow_idx on visual_workflow_sessions(workflow_id);
create index if not exists visual_workflow_sessions_subject_idx on visual_workflow_sessions(subject_type, subject_id);
