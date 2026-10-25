-- =============================================================================
-- Privileged tenancy operations. Each function authenticates via auth.uid(),
-- authorizes by role, enforces plan limits, and performs its writes atomically.
--
-- Errors use SQLSTATE 42501 for authorization failures and P0001 with a
-- machine-readable message prefix ("limit_exceeded:", "plan_feature:",
-- "conflict:", "invalid:", "not_found") that the server maps to user-facing
-- messages.
-- =============================================================================

create function app.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  return v_user;
end
$$;

-- Serializes plan-limited operations per organization.
create function app.lock_organization_subscription(p_organization_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select 1 from public.subscriptions where organization_id = p_organization_id for update
$$;

-- -----------------------------------------------------------------------------
-- Create an organization with its owner, a free subscription, and a first
-- workspace.
-- -----------------------------------------------------------------------------
create function app.create_organization(
  p_name text,
  p_workspace_name text,
  p_timezone text default 'UTC'
)
returns table (organization_id uuid, workspace_id uuid, workspace_slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_org uuid;
  v_ws uuid;
  v_ws_slug text;
  v_attempt integer := 0;
begin
  -- Abuse guard: a user may own at most 10 organizations.
  if (select count(*) from public.organization_members m where m.user_id = v_user and m.role = 'owner') >= 10 then
    raise exception 'limit_exceeded:organizations' using errcode = 'P0001';
  end if;

  loop
    begin
      insert into public.organizations (name, slug, created_by)
      values (btrim(p_name), app.unique_slug(p_name), v_user)
      returning id into v_org;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then raise; end if;
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into public.subscriptions (organization_id, plan_id, status, provider) values (v_org, 'free', 'active', 'none');

  v_attempt := 0;
  loop
    begin
      insert into public.workspaces (organization_id, name, slug, kind, timezone, created_by)
      values (v_org, btrim(p_workspace_name), app.unique_slug(p_workspace_name), 'internal', coalesce(p_timezone, 'UTC'), v_user)
      returning id, slug into v_ws, v_ws_slug;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then raise; end if;
    end;
  end loop;

  update public.profiles set default_workspace_id = v_ws where id = v_user and default_workspace_id is null;

  return query select v_org, v_ws, v_ws_slug;
end
$$;

-- -----------------------------------------------------------------------------
-- Create a workspace (internal, client, or demo) inside an organization.
-- -----------------------------------------------------------------------------
create function app.create_workspace(
  p_organization_id uuid,
  p_name text,
  p_kind public.workspace_kind default 'internal',
  p_timezone text default 'UTC',
  p_description text default null,
  p_is_demo boolean default false
)
returns table (workspace_id uuid, workspace_slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_limit integer;
  v_count integer;
  v_ws uuid;
  v_slug text;
  v_attempt integer := 0;
begin
  if app.role_rank(app.org_role(p_organization_id)::text) < 4 then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform app.lock_organization_subscription(p_organization_id);

  if p_is_demo then
    if exists (select 1 from public.workspaces w where w.organization_id = p_organization_id and w.is_demo and w.deleted_at is null) then
      raise exception 'conflict:demo_workspace_exists' using errcode = 'P0001';
    end if;
  else
    if p_kind = 'client' and not app.plan_has_feature(p_organization_id, 'client_workspaces') then
      raise exception 'plan_feature:client_workspaces' using errcode = 'P0001';
    end if;
    v_limit := app.plan_limit(p_organization_id, 'workspaces');
    select count(*) into v_count from public.workspaces w
      where w.organization_id = p_organization_id and not w.is_demo and w.deleted_at is null;
    if v_limit is not null and v_count >= v_limit then
      raise exception 'limit_exceeded:workspaces' using errcode = 'P0001';
    end if;
  end if;

  loop
    begin
      insert into public.workspaces (organization_id, name, slug, kind, is_demo, timezone, description, created_by)
      values (
        p_organization_id,
        btrim(p_name),
        app.unique_slug(p_name),
        p_kind,
        p_is_demo,
        coalesce(p_timezone, 'UTC'),
        nullif(btrim(coalesce(p_description, '')), ''),
        v_user
      )
      returning id, slug into v_ws, v_slug;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then raise; end if;
    end;
  end loop;

  return query select v_ws, v_slug;
end
$$;

-- -----------------------------------------------------------------------------
-- Soft-delete a workspace (organization owners and admins).
-- -----------------------------------------------------------------------------
create function app.delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  perform app.require_user();
  select w.organization_id into v_org from public.workspaces w where w.id = p_workspace_id and w.deleted_at is null;
  if v_org is null or app.role_rank(app.org_role(v_org)::text) < 4 then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.workspaces set deleted_at = now() where id = p_workspace_id;
  update public.profiles set default_workspace_id = null where default_workspace_id = p_workspace_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Invitations. The server generates the token and stores only its SHA-256.
-- -----------------------------------------------------------------------------
create function app.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role,
  p_workspace_ids uuid[],
  p_workspace_role public.workspace_role,
  p_token_hash text,
  p_ttl_hours integer default 168
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_email text := lower(btrim(p_email));
  v_limit integer;
  v_members integer;
  v_pending integer;
  v_id uuid;
begin
  if app.role_rank(app.org_role(p_organization_id)::text) < 4 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'invalid:role' using errcode = 'P0001';
  end if;
  if p_ttl_hours not between 1 and 720 then
    raise exception 'invalid:ttl' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_workspace_ids), 0) > 0 then
    if p_workspace_role is null then
      raise exception 'invalid:workspace_role' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from unnest(p_workspace_ids) as requested(id)
      where not exists (
        select 1 from public.workspaces w
        where w.id = requested.id and w.organization_id = p_organization_id and w.deleted_at is null
      )
    ) then
      raise exception 'invalid:workspace' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id and p.email = v_email
  ) then
    raise exception 'conflict:already_member' using errcode = 'P0001';
  end if;

  perform app.lock_organization_subscription(p_organization_id);

  -- Replace any pending invitation for the same address.
  update public.organization_invitations
    set revoked_at = now()
    where organization_id = p_organization_id and email = v_email and accepted_at is null and revoked_at is null;

  v_limit := app.plan_limit(p_organization_id, 'members');
  select count(*) into v_members from public.organization_members where organization_id = p_organization_id;
  select count(*) into v_pending from public.organization_invitations
    where organization_id = p_organization_id and accepted_at is null and revoked_at is null and expires_at > now();
  if v_limit is not null and v_members + v_pending >= v_limit then
    raise exception 'limit_exceeded:members' using errcode = 'P0001';
  end if;

  insert into public.organization_invitations (
    organization_id, email, role, workspace_ids, workspace_role, token_hash, invited_by, expires_at
  ) values (
    p_organization_id, v_email, p_role, coalesce(p_workspace_ids, '{}'), p_workspace_role, p_token_hash, v_user,
    now() + make_interval(hours => p_ttl_hours)
  )
  returning id into v_id;

  return v_id;
end
$$;

create function app.accept_invitation(p_token_hash text)
returns table (organization_id uuid, workspace_slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_email text;
  v_inv public.organization_invitations%rowtype;
  v_slug text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  select * into v_inv from public.organization_invitations i where i.token_hash = p_token_hash for update;

  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'invalid:invitation' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invalid:invitation_expired' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invalid:invitation_email_mismatch' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_inv.organization_id and o.deleted_at is null) then
    raise exception 'invalid:invitation' using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_inv.organization_id, v_user, v_inv.role, v_inv.invited_by)
  on conflict on constraint organization_members_pkey do nothing;

  if cardinality(v_inv.workspace_ids) > 0 then
    insert into public.workspace_members (workspace_id, organization_id, user_id, role, assigned_by)
    select w.id, w.organization_id, v_user, v_inv.workspace_role, v_inv.invited_by
    from public.workspaces w
    where w.id = any (v_inv.workspace_ids) and w.organization_id = v_inv.organization_id and w.deleted_at is null
    on conflict on constraint workspace_members_pkey do nothing;
  end if;

  update public.organization_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;

  select w.slug into v_slug
  from public.workspaces w
  where w.organization_id = v_inv.organization_id
    and w.deleted_at is null
    and (v_inv.role in ('admin') or w.id = any (v_inv.workspace_ids))
  order by w.created_at
  limit 1;

  update public.profiles p set default_workspace_id = (select w.id from public.workspaces w where w.slug = v_slug)
  where p.id = v_user and p.default_workspace_id is null and v_slug is not null;

  return query select v_inv.organization_id, v_slug;
end
$$;

-- -----------------------------------------------------------------------------
-- Soft-delete an organization (owners only).
-- -----------------------------------------------------------------------------
create function app.delete_organization(p_organization_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_user();
  if app.org_role(p_organization_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.workspaces set deleted_at = now() where organization_id = p_organization_id and deleted_at is null;
  update public.organizations set deleted_at = now() where id = p_organization_id;
  update public.profiles set default_workspace_id = null
    where default_workspace_id in (select id from public.workspaces where organization_id = p_organization_id);
end
$$;

grant execute on function
  app.create_organization(text, text, text),
  app.create_workspace(uuid, text, public.workspace_kind, text, text, boolean),
  app.delete_workspace(uuid),
  app.create_invitation(uuid, text, public.member_role, uuid[], public.workspace_role, text, integer),
  app.accept_invitation(text),
  app.delete_organization(uuid)
to authenticated;
