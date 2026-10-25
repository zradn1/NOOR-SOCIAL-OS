-- =============================================================================
-- Client guests
--
-- People from a client's side (brand managers, approvers) who join an agency's
-- organization with access to a single client workspace. They never see the
-- agency's other workspaces, its full roster, or organization settings.
-- Inviting guests is part of the plan feature `client_roles`.
-- =============================================================================

alter table public.organization_members
  add column is_client_guest boolean not null default false,
  add constraint organization_members_guest_role
    check (not is_client_guest or role in ('editor', 'analyst', 'viewer'));

alter table public.organization_invitations
  add column client_guest boolean not null default false,
  add constraint organization_invitations_guest_shape
    check (
      not client_guest
      or (role = 'viewer' and cardinality(workspace_ids) = 1 and workspace_role in ('editor', 'analyst', 'viewer'))
    );

-- True when the current user is a client guest of the organization.
create function app.is_client_guest(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.is_client_guest from public.organization_members m
      where m.organization_id = p_organization_id and m.user_id = auth.uid()),
    false
  )
$$;

grant execute on function app.is_client_guest(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Guests may only hold non-admin roles in live, non-demo client workspaces.
-- Applies to every writer, including the server's privileged connection.
-- -----------------------------------------------------------------------------
create function app.guard_client_guest_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.organization_members m
    where m.organization_id = new.organization_id and m.user_id = new.user_id and m.is_client_guest
  ) then
    if new.role = 'admin' then
      raise exception 'invalid:guest_role' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.workspaces w
      where w.id = new.workspace_id and w.kind = 'client' and not w.is_demo and w.deleted_at is null
    ) then
      raise exception 'invalid:guest_workspace' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger workspace_members_30_guard_client_guest
  before insert or update on public.workspace_members
  for each row execute function app.guard_client_guest_assignment();

-- -----------------------------------------------------------------------------
-- Visibility: guests see people who share a workspace with them, not the
-- agency's whole roster. Staff visibility is unchanged.
-- -----------------------------------------------------------------------------
create or replace function app.shares_organization_with(p_user_id uuid)
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
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id and not mine.is_client_guest
  )
  or exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = p_user_id
      and wm.workspace_id in (select app.accessible_workspace_ids(1))
  )
$$;

drop policy organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members for select to authenticated
  using (
    organization_id in (select app.member_organization_ids(1))
    and (
      user_id = (select auth.uid())
      or not app.is_client_guest(organization_id)
      or app.shares_organization_with(user_id)
    )
  );

-- Workspace admins (not only organization admins) manage their client's guests.
create policy organization_members_delete_guest on public.organization_members for delete to authenticated
  using (
    is_client_guest
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = organization_members.user_id
        and wm.organization_id = organization_members.organization_id
        and wm.workspace_id in (select app.accessible_workspace_ids(4))
    )
  );

create policy organization_invitations_select_guest on public.organization_invitations for select to authenticated
  using (client_guest and workspace_ids[1] in (select app.accessible_workspace_ids(4)));
create policy organization_invitations_revoke_guest on public.organization_invitations for update to authenticated
  using (client_guest and accepted_at is null and workspace_ids[1] in (select app.accessible_workspace_ids(4)))
  with check (client_guest and workspace_ids[1] in (select app.accessible_workspace_ids(4)));

-- -----------------------------------------------------------------------------
-- Invite a guest into one client workspace (workspace admins; plan-gated).
-- Guests count toward the plan's member limit.
-- -----------------------------------------------------------------------------
create function app.create_client_invitation(
  p_workspace_id uuid,
  p_email text,
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
  v_org uuid;
  v_limit integer;
  v_members integer;
  v_pending integer;
  v_id uuid;
begin
  -- Authorization first, so the call reveals nothing about other workspaces.
  if app.workspace_role_rank(p_workspace_id) < 4 or app.is_client_guest(
    (select w.organization_id from public.workspaces w where w.id = p_workspace_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select w.organization_id into v_org
  from public.workspaces w
  where w.id = p_workspace_id and w.deleted_at is null and w.kind = 'client' and not w.is_demo;
  if v_org is null then
    raise exception 'invalid:guest_workspace' using errcode = 'P0001';
  end if;
  if not app.plan_has_feature(v_org, 'client_roles') then
    raise exception 'plan_feature:client_roles' using errcode = 'P0001';
  end if;
  if p_workspace_role is null or p_workspace_role = 'admin' then
    raise exception 'invalid:guest_role' using errcode = 'P0001';
  end if;
  if p_ttl_hours not between 1 and 720 then
    raise exception 'invalid:ttl' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = v_org and p.email = v_email
  ) then
    raise exception 'conflict:already_member' using errcode = 'P0001';
  end if;

  perform app.lock_organization_subscription(v_org);

  update public.organization_invitations
    set revoked_at = now()
    where organization_id = v_org and email = v_email and accepted_at is null and revoked_at is null;

  v_limit := app.plan_limit(v_org, 'members');
  select count(*) into v_members from public.organization_members where organization_id = v_org;
  select count(*) into v_pending from public.organization_invitations
    where organization_id = v_org and accepted_at is null and revoked_at is null and expires_at > now();
  if v_limit is not null and v_members + v_pending >= v_limit then
    raise exception 'limit_exceeded:members' using errcode = 'P0001';
  end if;

  insert into public.organization_invitations (
    organization_id, email, role, workspace_ids, workspace_role, token_hash, invited_by, expires_at, client_guest
  ) values (
    v_org, v_email, 'viewer', array[p_workspace_id], p_workspace_role, p_token_hash, v_user,
    now() + make_interval(hours => p_ttl_hours), true
  )
  returning id into v_id;
  return v_id;
end
$$;

grant execute on function app.create_client_invitation(uuid, text, public.workspace_role, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Acceptance now records whether the new member is a client guest.
-- -----------------------------------------------------------------------------
create or replace function app.accept_invitation(p_token_hash text)
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

  insert into public.organization_members (organization_id, user_id, role, invited_by, is_client_guest)
  values (v_inv.organization_id, v_user, v_inv.role, v_inv.invited_by, v_inv.client_guest)
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
