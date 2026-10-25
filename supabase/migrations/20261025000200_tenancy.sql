-- =============================================================================
-- Tenancy: profiles, organizations, memberships, workspaces, invitations,
-- platform administrators. Row Level Security on every table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created by trigger)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  default_workspace_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create function app.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  return new;
end
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.handle_auth_user_email_change();

-- -----------------------------------------------------------------------------
-- Organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Workspaces (a brand or a client) and explicit assignments
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  kind public.workspace_kind not null default 'internal',
  is_demo boolean not null default false,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  description text check (description is null or char_length(description) <= 280),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id)
);
create index workspaces_org_idx on public.workspaces (organization_id) where deleted_at is null;
-- At most one live demo workspace per organization.
create unique index workspaces_one_demo_per_org on public.workspaces (organization_id)
  where is_demo and deleted_at is null;

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function app.set_updated_at();

create function app.guard_workspace_immutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo then
    raise exception 'workspaces.is_demo is immutable' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'workspaces.organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger workspaces_guard_immutables before update on public.workspaces
  for each row execute function app.guard_workspace_immutables();

alter table public.profiles
  add constraint profiles_default_workspace_fk
  foreign key (default_workspace_id) references public.workspaces (id) on delete set null;

create table public.workspace_members (
  workspace_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  role public.workspace_role not null,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  -- The workspace must belong to the organization...
  foreign key (organization_id, workspace_id)
    references public.workspaces (organization_id, id) on delete cascade,
  -- ...and the user must be a member of that organization. Removing someone
  -- from the organization removes every workspace assignment.
  foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create trigger workspace_members_updated_at before update on public.workspace_members
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  workspace_ids uuid[] not null default '{}',
  workspace_role public.workspace_role,
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (cardinality(workspace_ids) = 0 or workspace_role is not null)
);
create unique index organization_invitations_pending_email
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- Platform administrators (Noor Studio operators). Never exposed to API roles.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Authorization helpers (security definer, empty search_path)
-- =============================================================================

-- Organizations where the current user's role rank is at least p_min_rank.
create function app.member_organization_ids(p_min_rank integer default 1)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.user_id = auth.uid()
    and app.role_rank(m.role::text) >= p_min_rank
$$;

create function app.org_role(p_organization_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.organization_id = p_organization_id and m.user_id = auth.uid()
$$;

-- Effective role in a workspace: organization owners/admins inherit their role
-- everywhere; everyone else needs an explicit workspace assignment.
create function app.workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when om.role in ('owner', 'admin') then om.role::text else wm.role::text end
  from public.workspaces w
  join public.organizations o on o.id = w.organization_id and o.deleted_at is null
  join public.organization_members om on om.organization_id = w.organization_id and om.user_id = auth.uid()
  left join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid()
  where w.id = p_workspace_id
    and w.deleted_at is null
    and (om.role in ('owner', 'admin') or wm.role is not null)
$$;

create function app.workspace_role_rank(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.role_rank(app.workspace_role(p_workspace_id)), 0)
$$;

-- Workspaces the current user can access with at least p_min_rank. Used in RLS
-- as `workspace_id in (select app.accessible_workspace_ids(n))` so it runs once
-- per statement rather than once per row.
create function app.accessible_workspace_ids(p_min_rank integer default 1)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  join public.organizations o on o.id = w.organization_id and o.deleted_at is null
  join public.organization_members om on om.organization_id = w.organization_id and om.user_id = auth.uid()
  left join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid()
  where w.deleted_at is null
    and app.role_rank(case when om.role in ('owner', 'admin') then om.role::text else wm.role::text end) >= p_min_rank
$$;

-- True when the given user shares at least one organization with the current user.
create function app.shares_organization_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
$$;

create function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

grant execute on function
  app.member_organization_ids(integer),
  app.org_role(uuid),
  app.workspace_role(uuid),
  app.workspace_role_rank(uuid),
  app.accessible_workspace_ids(integer),
  app.shares_organization_with(uuid)
to authenticated, service_role;

-- =============================================================================
-- Integrity triggers
-- =============================================================================

-- An organization always keeps at least one owner. Cascading deletes of the
-- organization itself are allowed.
create function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = old.organization_id and role = 'owner' and user_id <> old.user_id
  ) then
    raise exception 'last_owner: an organization must keep at least one owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end
$$;

-- Triggers fire in name order: authorization (10) before integrity (20).
create trigger organization_members_20_guard_last_owner
  before update of role or delete on public.organization_members
  for each row execute function app.guard_last_owner();

-- Only an owner may create or modify owner memberships through the API.
-- Runs as the invoker on purpose: current_user must be the calling role.
create function app.guard_owner_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Privileged (server/system) connections are not restricted here.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner') or (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner') then
    if app.org_role(coalesce(new.organization_id, old.organization_id)) is distinct from 'owner' then
      raise exception 'forbidden: only owners can change owner memberships' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end
$$;

create trigger organization_members_10_guard_owner_changes
  before insert or update or delete on public.organization_members
  for each row execute function app.guard_owner_changes();

-- profiles.default_workspace_id must point at a workspace the user can access.
-- Runs as the invoker on purpose: current_user must be the calling role.
create function app.guard_default_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.default_workspace_id is not null
     and new.default_workspace_id is distinct from old.default_workspace_id
     and current_user in ('authenticated', 'anon')
     and app.workspace_role_rank(new.default_workspace_id) = 0 then
    raise exception 'forbidden: workspace not accessible' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_guard_default_workspace before update of default_workspace_id on public.profiles
  for each row execute function app.guard_default_workspace();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.platform_admins enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members, public.workspaces,
  public.workspace_members, public.organization_invitations, public.platform_admins
  from anon, authenticated;

-- profiles: see yourself and people you share an organization with; edit yourself.
grant select on public.profiles to authenticated;
grant update (full_name, timezone, default_workspace_id) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_organization_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations: members read; admins rename. Creation and deletion go through
-- app.create_organization / app.delete_organization.
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select app.member_organization_ids(1)));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select app.member_organization_ids(4)))
  with check (id in (select app.member_organization_ids(4)));

-- organization_members: members read the roster; admins change roles and remove
-- members (owner rows are further guarded by trigger); anyone may leave.
grant select, delete on public.organization_members to authenticated;
grant update (role) on public.organization_members to authenticated;

create policy organization_members_select on public.organization_members for select to authenticated
  using (organization_id in (select app.member_organization_ids(1)));
create policy organization_members_update on public.organization_members for update to authenticated
  using (organization_id in (select app.member_organization_ids(4)))
  with check (organization_id in (select app.member_organization_ids(4)));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id in (select app.member_organization_ids(4))
  );

-- workspaces: visible only when accessible; workspace admins edit settings.
-- Creation goes through app.create_workspace (role + plan limit checks).
grant select on public.workspaces to authenticated;
grant update (name, timezone, description) on public.workspaces to authenticated;

create policy workspaces_select on public.workspaces for select to authenticated
  using (id in (select app.accessible_workspace_ids(1)));
create policy workspaces_update on public.workspaces for update to authenticated
  using (id in (select app.accessible_workspace_ids(4)))
  with check (id in (select app.accessible_workspace_ids(4)));

-- workspace_members: anyone with access sees who else is assigned; workspace
-- admins assign, change, and remove. The composite foreign keys guarantee the
-- assignee belongs to the same organization.
grant select, insert, delete on public.workspace_members to authenticated;
grant update (role) on public.workspace_members to authenticated;

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)));
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (workspace_id in (select app.accessible_workspace_ids(4)) and assigned_by = (select auth.uid()));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(4)))
  with check (workspace_id in (select app.accessible_workspace_ids(4)));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(4)));

-- invitations: organization admins see and revoke; creation and acceptance go
-- through security-definer functions.
grant select on public.organization_invitations to authenticated;
grant update (revoked_at) on public.organization_invitations to authenticated;

create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (organization_id in (select app.member_organization_ids(4)));
create policy organization_invitations_revoke on public.organization_invitations for update to authenticated
  using (organization_id in (select app.member_organization_ids(4)) and accepted_at is null)
  with check (organization_id in (select app.member_organization_ids(4)));

-- platform_admins: no policies and no grants. Only the server's privileged
-- connection can read it.
