-- =============================================================================
-- Social accounts, OAuth, media, content, platform targets.
--
-- Demo isolation: every tenant-owned row carries `is_demo`, copied from its
-- workspace by trigger and immutable afterwards. Demo workspaces can never hold
-- OAuth tokens, and only demo accounts may use the `demo` connection status.
-- =============================================================================

create type public.social_platform as enum ('instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'x', 'pinterest');

-- demo:         simulated account in a demo workspace (never a real connection)
-- manual:       tracked by hand for imported analytics; NOT connected, cannot publish
-- pending:      OAuth started, not yet verified
-- connected:    verified by the provider through OAuth
-- expired/revoked/error/disconnected: no usable credentials
create type public.connection_status as enum (
  'demo', 'manual', 'pending', 'connected', 'expired', 'revoked', 'error', 'disconnected'
);

-- Copies workspaces.is_demo onto tenant rows and keeps it immutable.
create function app.inherit_demo_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select w.is_demo into new.is_demo from public.workspaces w where w.id = new.workspace_id;
    if new.is_demo is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  elsif new.is_demo is distinct from old.is_demo then
    raise exception 'is_demo is immutable' using errcode = '42501';
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Social accounts (written only by the server after authorization)
-- -----------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  organization_id uuid not null,
  platform public.social_platform not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  handle text check (handle is null or char_length(handle) <= 120),
  external_account_id text not null check (char_length(external_account_id) between 1 and 200),
  connection_status public.connection_status not null,
  is_demo boolean not null default false,
  granted_scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (organization_id, workspace_id) references public.workspaces (organization_id, id) on delete cascade,
  unique (workspace_id, id),
  -- Demo status if and only if the account lives in a demo workspace.
  constraint social_accounts_demo_status check ((connection_status = 'demo') = is_demo),
  constraint social_accounts_demo_id check (not is_demo or external_account_id like 'demo\_%'),
  constraint social_accounts_manual_id check (connection_status <> 'manual' or external_account_id like 'manual\_%'),
  constraint social_accounts_connected_at check (connection_status <> 'connected' or connected_at is not null)
);
create unique index social_accounts_external_unique
  on public.social_accounts (workspace_id, platform, external_account_id) where deleted_at is null;
create index social_accounts_workspace_idx on public.social_accounts (workspace_id) where deleted_at is null;
create index social_accounts_org_live_idx on public.social_accounts (organization_id) where deleted_at is null and not is_demo;

create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function app.set_updated_at();
create trigger social_accounts_demo_flag before insert or update on public.social_accounts
  for each row execute function app.inherit_demo_flag();

-- -----------------------------------------------------------------------------
-- OAuth connections: encrypted tokens. No API role can read or write them.
-- -----------------------------------------------------------------------------
create table public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null unique references public.social_accounts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider public.social_platform not null,
  -- AES-256-GCM envelopes "keyId:iv:tag:ciphertext" (base64url), bound to the
  -- social account id as additional authenticated data.
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  key_id text not null check (char_length(key_id) between 1 and 32),
  token_type text check (token_type is null or char_length(token_type) <= 40),
  scopes text[] not null default '{}',
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  provider_user_id text check (provider_user_id is null or char_length(provider_user_id) <= 200),
  last_refreshed_at timestamptz,
  refresh_failure_count integer not null default 0 check (refresh_failure_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (revoked_at is null or (access_token_ciphertext is null and refresh_token_ciphertext is null))
);
create index oauth_connections_expiry_idx on public.oauth_connections (access_token_expires_at)
  where revoked_at is null;

create trigger oauth_connections_updated_at before update on public.oauth_connections
  for each row execute function app.set_updated_at();

create function app.guard_demo_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.is_demo) then
    raise exception 'demo workspaces cannot store platform credentials' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger oauth_connections_no_demo before insert or update on public.oauth_connections
  for each row execute function app.guard_demo_tokens();

-- Single-use OAuth state (CSRF protection) with the PKCE verifier, encrypted.
create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (char_length(state_hash) = 64),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.social_platform not null,
  code_verifier_ciphertext text not null,
  redirect_path text not null check (redirect_path ~ '^/' and redirect_path !~ '^//'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expiry_idx on public.oauth_states (expires_at);

-- -----------------------------------------------------------------------------
-- Media assets: a Supabase Storage object or an external HTTPS reference.
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null check (source in ('storage', 'url')),
  storage_bucket text,
  storage_path text check (storage_path is null or (char_length(storage_path) <= 500 and storage_path !~ '\.\.')),
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 2000)),
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null check (mime_type ~ '^(image|video)/[a-z0-9.+-]+$'),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5368709120)),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 43200000),
  alt_text text check (alt_text is null or char_length(alt_text) <= 1000),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  upload_status text not null default 'ready' check (upload_status in ('pending', 'ready', 'failed')),
  is_demo boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  check (
    (source = 'storage' and storage_bucket is not null and storage_path is not null and external_url is null)
    or (source = 'url' and external_url is not null and storage_path is null)
  ),
  check (kind <> 'video' or mime_type like 'video/%'),
  check (kind <> 'image' or mime_type like 'image/%')
);
create index media_assets_workspace_idx on public.media_assets (workspace_id, created_at desc) where deleted_at is null;
create unique index media_assets_storage_path_unique on public.media_assets (storage_bucket, storage_path)
  where storage_path is not null;

create trigger media_assets_updated_at before update on public.media_assets
  for each row execute function app.set_updated_at();
create trigger media_assets_demo_flag before insert or update on public.media_assets
  for each row execute function app.inherit_demo_flag();

-- -----------------------------------------------------------------------------
-- Content posts
-- -----------------------------------------------------------------------------
create type public.post_status as enum (
  'draft', 'ready', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'simulated', 'archived'
);

create function app.valid_hashtags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(t ~ '^[^\s#]{1,100}$'), true) from unnest(p_tags) as t
$$;

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text check (title is null or char_length(title) <= 120),
  caption text not null default '' check (char_length(caption) <= 70000),
  -- Stored without the leading "#".
  hashtags text[] not null default '{}' check (cardinality(hashtags) <= 60 and app.valid_hashtags(hashtags)),
  first_comment text check (first_comment is null or char_length(first_comment) <= 2200),
  link_url text check (link_url is null or (link_url ~ '^https?://' and char_length(link_url) <= 2000)),
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  schedule_timezone text check (schedule_timezone is null or char_length(schedule_timezone) <= 64),
  published_at timestamptz,
  -- Incremented on every content edit; editors use it to detect concurrent changes.
  revision integer not null default 1 check (revision > 0),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  check (status <> 'scheduled' or scheduled_at is not null),
  check (status <> 'simulated' or is_demo),
  check (not is_demo or status not in ('published', 'partially_published'))
);
create index content_posts_workspace_status_idx on public.content_posts (workspace_id, status) where deleted_at is null;
create index content_posts_workspace_schedule_idx on public.content_posts (workspace_id, scheduled_at) where deleted_at is null;
create index content_posts_workspace_updated_idx on public.content_posts (workspace_id, updated_at desc) where deleted_at is null;

create trigger content_posts_updated_at before update on public.content_posts
  for each row execute function app.set_updated_at();
create trigger content_posts_demo_flag before insert or update on public.content_posts
  for each row execute function app.inherit_demo_flag();

-- API roles may only move posts between draft, ready, and archived, and
-- cannot edit a post while it is being published or after it went out.
-- Runs as the invoker on purpose: current_user must be the calling role.
create function app.guard_post_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status is distinct from old.status and new.status not in ('draft', 'ready', 'archived') then
    raise exception 'transition:post_status' using errcode = 'P0001';
  end if;
  if old.status = 'publishing' then
    raise exception 'transition:post_publishing' using errcode = 'P0001';
  end if;
  if old.status = 'scheduled' and new.status in ('draft', 'ready') then
    raise exception 'transition:post_scheduled' using errcode = 'P0001';
  end if;
  if old.status in ('published', 'partially_published', 'simulated')
     and (new.caption, new.hashtags, new.title, new.first_comment, new.link_url)
         is distinct from (old.caption, old.hashtags, old.title, old.first_comment, old.link_url) then
    raise exception 'transition:post_published' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger content_posts_10_guard before update on public.content_posts
  for each row execute function app.guard_post_changes();

create function app.bump_post_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.caption, new.hashtags, new.title, new.first_comment, new.link_url)
     is distinct from (old.caption, old.hashtags, old.title, old.first_comment, old.link_url) then
    new.revision := old.revision + 1;
  end if;
  return new;
end
$$;

create trigger content_posts_20_revision before update on public.content_posts
  for each row execute function app.bump_post_revision();

-- -----------------------------------------------------------------------------
-- Platform targets: one row per destination account for a post.
-- -----------------------------------------------------------------------------
create type public.target_status as enum (
  'pending', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'blocked', 'simulated', 'cancelled'
);

create table public.post_platform_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  post_id uuid not null,
  social_account_id uuid not null,
  platform public.social_platform not null,
  caption_override text check (caption_override is null or char_length(caption_override) <= 70000),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 8192),
  status public.target_status not null default 'pending',
  external_post_id text check (external_post_id is null or char_length(external_post_id) <= 200),
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 2000)),
  published_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, post_id) references public.content_posts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, social_account_id) references public.social_accounts (workspace_id, id) on delete cascade,
  unique (post_id, social_account_id),
  -- A target is published only with the provider's confirmation (its post id).
  constraint targets_published_requires_confirmation
    check (status <> 'published' or (external_post_id is not null and published_at is not null)),
  constraint targets_simulated_only_demo check (status <> 'simulated' or is_demo),
  constraint targets_demo_never_published check (not (is_demo and status = 'published'))
);
create index post_platform_targets_post_idx on public.post_platform_targets (post_id);
create index post_platform_targets_account_idx on public.post_platform_targets (social_account_id);

create trigger post_platform_targets_updated_at before update on public.post_platform_targets
  for each row execute function app.set_updated_at();
create trigger post_platform_targets_demo_flag before insert or update on public.post_platform_targets
  for each row execute function app.inherit_demo_flag();

-- The platform always comes from the account, never from the caller.
create function app.target_platform_from_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.platform into new.platform
  from public.social_accounts a
  where a.id = new.social_account_id and a.deleted_at is null;
  if new.platform is null then
    raise exception 'invalid:account' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger post_platform_targets_platform before insert or update of social_account_id on public.post_platform_targets
  for each row execute function app.target_platform_from_account();

create table public.post_media (
  post_id uuid not null,
  workspace_id uuid not null,
  media_asset_id uuid not null,
  position smallint not null check (position between 0 and 34),
  created_at timestamptz not null default now(),
  primary key (post_id, media_asset_id),
  unique (post_id, position) deferrable initially deferred,
  foreign key (workspace_id, post_id) references public.content_posts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, media_asset_id) references public.media_assets (workspace_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_posts enable row level security;
alter table public.post_platform_targets enable row level security;
alter table public.post_media enable row level security;

revoke all on public.social_accounts, public.oauth_connections, public.oauth_states, public.media_assets,
  public.content_posts, public.post_platform_targets, public.post_media
  from anon, authenticated;

-- social_accounts: readable in accessible workspaces; written by the server.
grant select on public.social_accounts to authenticated;
create policy social_accounts_select on public.social_accounts for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)) and deleted_at is null);

-- oauth_connections, oauth_states: no grants, no policies.

-- media_assets: viewers read, editors manage metadata.
grant select on public.media_assets to authenticated;
grant insert (workspace_id, source, storage_bucket, storage_path, external_url, kind, mime_type, file_name,
  size_bytes, width, height, duration_ms, alt_text, checksum_sha256, upload_status, uploaded_by)
  on public.media_assets to authenticated;
grant update (alt_text, file_name, width, height, duration_ms, deleted_at) on public.media_assets to authenticated;
create policy media_assets_select on public.media_assets for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)) and deleted_at is null);
create policy media_assets_insert on public.media_assets for insert to authenticated
  with check (workspace_id in (select app.accessible_workspace_ids(3)) and uploaded_by = (select auth.uid()));
create policy media_assets_update on public.media_assets for update to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)))
  with check (workspace_id in (select app.accessible_workspace_ids(3)));

-- content_posts: viewers read, editors write. Status and schedule columns are
-- not granted: scheduling goes through app.schedule_post().
grant select on public.content_posts to authenticated;
grant insert (workspace_id, title, caption, hashtags, first_comment, link_url, status, created_by, updated_by)
  on public.content_posts to authenticated;
grant update (title, caption, hashtags, first_comment, link_url, status, updated_by, deleted_at)
  on public.content_posts to authenticated;
create policy content_posts_select on public.content_posts for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)) and deleted_at is null);
create policy content_posts_insert on public.content_posts for insert to authenticated
  with check (
    workspace_id in (select app.accessible_workspace_ids(3))
    and created_by = (select auth.uid())
    and status in ('draft', 'ready')
  );
create policy content_posts_update on public.content_posts for update to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)))
  with check (workspace_id in (select app.accessible_workspace_ids(3)));

-- post_platform_targets: editors choose destinations and overrides; status is
-- owned by the publishing pipeline.
grant select on public.post_platform_targets to authenticated;
grant insert (workspace_id, post_id, social_account_id, caption_override, settings) on public.post_platform_targets to authenticated;
grant update (caption_override, settings) on public.post_platform_targets to authenticated;
grant delete on public.post_platform_targets to authenticated;
create policy targets_select on public.post_platform_targets for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)));
create policy targets_insert on public.post_platform_targets for insert to authenticated
  with check (workspace_id in (select app.accessible_workspace_ids(3)));
create policy targets_update on public.post_platform_targets for update to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)) and status in ('pending', 'cancelled', 'failed', 'blocked'))
  with check (workspace_id in (select app.accessible_workspace_ids(3)));
create policy targets_delete on public.post_platform_targets for delete to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)) and status in ('pending', 'cancelled', 'failed', 'blocked'));

grant select, insert, delete on public.post_media to authenticated;
grant update (position) on public.post_media to authenticated;
create policy post_media_select on public.post_media for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)));
create policy post_media_write on public.post_media for insert to authenticated
  with check (workspace_id in (select app.accessible_workspace_ids(3)));
create policy post_media_update on public.post_media for update to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)))
  with check (workspace_id in (select app.accessible_workspace_ids(3)));
create policy post_media_delete on public.post_media for delete to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(3)));

-- -----------------------------------------------------------------------------
-- Storage: private bucket; object paths start with the workspace id.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 1073741824, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy media_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in (select app.accessible_workspace_ids(1)::text));
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] in (select app.accessible_workspace_ids(3)::text));
create policy media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in (select app.accessible_workspace_ids(3)::text));
