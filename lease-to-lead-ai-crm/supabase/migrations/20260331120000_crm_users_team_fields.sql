-- Team profile + roster fields on CRM logins (single source for agents + users)
alter table crm_users add column if not exists display_name text;
alter table crm_users add column if not exists email text;
alter table crm_users add column if not exists agent_role text not null default 'General';
alter table crm_users add column if not exists agent_status text not null default 'Active';

update crm_users set display_name = username where display_name is null or display_name = '';
