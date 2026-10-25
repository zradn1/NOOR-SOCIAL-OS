-- =============================================================================
-- Audit log (append-only), in-app notifications, system heartbeats.
-- =============================================================================

-- Audit entries reference tenants by id without foreign keys on purpose: an
-- audit record must outlive what it describes and must never be rewritten by a
-- cascading update.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  workspace_id uuid,
  actor_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'platform_admin')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$' and char_length(action) <= 80),
  target_type text check (target_type is null or char_length(target_type) <= 60),
  target_id text check (target_id is null or char_length(target_id) <= 120),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) < 8192),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_workspace_time_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_actor_time_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- Append-only. A retention job may purge old rows by setting
-- `app.audit_purge = 'on'` for its transaction.
create function app.guard_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function app.guard_audit_log();

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (organization_id in (select app.member_organization_ids(4)));

-- -----------------------------------------------------------------------------
-- Notifications (created by the server; users read and mark them read)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+(\.[a-z_]+)*$'),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or (link ~ '^/' and link !~ '^//' and char_length(link) <= 300)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_time_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select app.accessible_workspace_ids(1)))
  );
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- System heartbeats (worker liveness for the admin health page)
-- -----------------------------------------------------------------------------
create table public.system_heartbeats (
  component text primary key check (char_length(component) <= 60),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object')
);
alter table public.system_heartbeats enable row level security;
revoke all on public.system_heartbeats from anon, authenticated;
