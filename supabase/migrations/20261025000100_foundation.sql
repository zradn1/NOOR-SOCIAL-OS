-- =============================================================================
-- Foundation: private schema, shared enums, helper functions, rate limiting.
-- =============================================================================

-- Private schema for helpers and privileged functions. It is not exposed through
-- the Supabase Data API (only `public` and `graphql_public` are by default).
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- New functions are not executable by PUBLIC; every grant below is explicit.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- Roles. Hierarchical: viewer < analyst < editor < admin < owner.
create type public.member_role as enum ('owner', 'admin', 'editor', 'analyst', 'viewer');
create type public.workspace_role as enum ('admin', 'editor', 'analyst', 'viewer');
create type public.workspace_kind as enum ('internal', 'client');

create function app.role_rank(p_role text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_role
    when 'owner' then 5
    when 'admin' then 4
    when 'editor' then 3
    when 'analyst' then 2
    when 'viewer' then 1
    else 0
  end
$$;

create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Lowercase, hyphenated, ASCII slug base (max 40 chars) for URLs.
create function app.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g')),
        40
      ),
      ''
    ),
    'workspace'
  )
$$;

-- Slug base plus a short random suffix: "maison-noor-k3x9q2".
create function app.unique_slug(p_value text)
returns text
language sql
volatile
set search_path = ''
as $$
  select trim(both '-' from app.slugify(p_value)) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
$$;

grant execute on function app.role_rank(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Rate limiting: fixed-window counters shared by every app instance.
-- Keys are opaque (e.g. "sign-in:<hmac(ip)>"); raw IPs are never stored.
-- -----------------------------------------------------------------------------
create table public.rate_limit_buckets (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (key, window_start)
);
create index rate_limit_buckets_window_idx on public.rate_limit_buckets (window_start);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

-- Returns true when the call is allowed, false when the limit is exceeded.
create function app.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = b.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max;
end
$$;

-- Old windows are garbage; the worker calls this periodically.
create function app.prune_rate_limits(p_older_than interval default interval '1 day')
returns integer
language sql
volatile
set search_path = ''
as $$
  with deleted as (
    delete from public.rate_limit_buckets where window_start < now() - p_older_than returning 1
  )
  select count(*)::integer from deleted
$$;

-- Only the server's privileged connection uses these (no API role grant).
revoke execute on function app.rate_limit_hit(text, integer, integer) from public;
revoke execute on function app.prune_rate_limits(interval) from public;
