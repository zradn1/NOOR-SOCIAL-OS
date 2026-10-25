-- =============================================================================
-- Billing: plans, subscriptions, usage metering, verified webhook event log.
-- Subscriptions change only through the server's privileged connection after a
-- verified provider webhook. No API role can write any table in this file.
-- =============================================================================

create table public.subscription_plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  description text not null default '',
  -- Display price (minor units). Charging uses provider price ids from env.
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- null value for a key = unlimited
  limits jsonb not null check (jsonb_typeof(limits) = 'object'),
  features text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function app.set_updated_at();

insert into public.subscription_plans (id, name, description, price_cents, limits, features, sort_order) values
  ('free', 'Free', 'For creators getting started.', 0,
    '{"workspaces":1,"social_accounts":3,"members":2,"scheduled_posts_per_month":10,"ai_generations_per_month":20,"analytics_history_days":30}',
    '{}', 0),
  ('starter', 'Starter', 'For small businesses publishing every week.', 1900,
    '{"workspaces":2,"social_accounts":8,"members":3,"scheduled_posts_per_month":100,"ai_generations_per_month":200,"analytics_history_days":90}',
    '{analytics_import}', 1),
  ('pro', 'Pro', 'For growing brands and freelancers managing clients.', 4900,
    '{"workspaces":5,"social_accounts":25,"members":10,"scheduled_posts_per_month":null,"ai_generations_per_month":1000,"analytics_history_days":365}',
    '{analytics_import,client_workspaces,audit_log}', 2),
  ('agency', 'Agency', 'For agencies running many client workspaces.', 14900,
    '{"workspaces":50,"social_accounts":150,"members":50,"scheduled_posts_per_month":null,"ai_generations_per_month":5000,"analytics_history_days":730}',
    '{analytics_import,client_workspaces,audit_log,client_roles}', 3);

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_id text not null references public.subscription_plans (id),
  status public.subscription_status not null default 'active',
  provider text not null default 'none' check (provider in ('none', 'stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- A downgrade scheduled for the end of the current period.
  pending_plan_id text references public.subscription_plans (id),
  -- Timestamp of the latest applied provider event; older events are ignored.
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider <> 'none' or plan_id = 'free')
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();

create type public.usage_metric as enum ('ai_generation', 'post_scheduled', 'post_published', 'analytics_import');

create table public.usage_records (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  metric public.usage_metric not null,
  quantity integer not null default 1 check (quantity > 0),
  is_demo boolean not null default false,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) < 4096)
);
create index usage_records_org_metric_time_idx on public.usage_records (organization_id, metric, occurred_at desc);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  type text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  -- The raw payload is not stored; its digest proves what was processed.
  payload_digest text not null check (char_length(payload_digest) = 64),
  event_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text check (outcome is null or outcome in ('applied', 'ignored', 'failed')),
  error text check (error is null or char_length(error) <= 500),
  unique (provider, provider_event_id)
);

-- -----------------------------------------------------------------------------
-- Plan helpers
-- -----------------------------------------------------------------------------

-- Canceled and unpaid subscriptions fall back to the free plan's limits.
create function app.effective_plan_id(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when s.status in ('active', 'trialing', 'past_due') then s.plan_id
        else 'free'
      end
      from public.subscriptions s
      where s.organization_id = p_organization_id
    ),
    'free'
  )
$$;

-- Returns null when unlimited.
create function app.plan_limit(p_organization_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (p.limits ->> p_key)::integer
  from public.subscription_plans p
  where p.id = app.effective_plan_id(p_organization_id)
$$;

create function app.plan_has_feature(p_organization_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_feature = any (p.features), false)
  from public.subscription_plans p
  where p.id = app.effective_plan_id(p_organization_id)
$$;

-- Non-demo usage in the current calendar month (UTC).
create function app.monthly_usage(p_organization_id uuid, p_metric public.usage_metric)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)
  from public.usage_records
  where organization_id = p_organization_id
    and metric = p_metric
    and not is_demo
    and occurred_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
$$;

grant execute on function
  app.effective_plan_id(uuid),
  app.plan_limit(uuid, text),
  app.plan_has_feature(uuid, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_records enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.subscription_plans, public.subscriptions, public.usage_records, public.billing_events
  from anon, authenticated;

grant select on public.subscription_plans to authenticated;
create policy subscription_plans_select on public.subscription_plans for select to authenticated
  using (is_active);

-- Billing details are visible to organization owners and admins.
grant select on public.subscriptions to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (organization_id in (select app.member_organization_ids(4)));

grant select on public.usage_records to authenticated;
create policy usage_records_select on public.usage_records for select to authenticated
  using (organization_id in (select app.member_organization_ids(4)));

-- billing_events: no grants, no policies (server only).
