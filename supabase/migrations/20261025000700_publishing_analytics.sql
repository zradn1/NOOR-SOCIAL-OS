-- =============================================================================
-- Publishing queue, analytics snapshots, AI generation history.
-- =============================================================================

-- pending:   waiting for run_at
-- running:   claimed by a worker (locked_at / locked_by)
-- succeeded: the provider confirmed the post (target is `published`)
-- simulated: demo workspace; nothing was sent anywhere
-- blocked:   cannot run (integration not implemented/configured, account not
--            connected, capability missing); never retried automatically
-- failed:    permanent error, attempts exhausted, or unknown outcome
-- cancelled: unscheduled, rescheduled, archived, or deleted
create type public.job_status as enum ('pending', 'running', 'succeeded', 'simulated', 'blocked', 'failed', 'cancelled');

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  post_id uuid not null,
  target_id uuid not null references public.post_platform_targets (id) on delete cascade,
  -- One job per publish intent (target + scheduled instant). Duplicate
  -- requests collide here instead of double-posting.
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  status public.job_status not null default 'pending',
  run_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_at timestamptz,
  locked_by text check (locked_by is null or char_length(locked_by) <= 100),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  provider_response jsonb check (provider_response is null or pg_column_size(provider_response) < 8192),
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, post_id) references public.content_posts (workspace_id, id) on delete cascade,
  check (status <> 'running' or locked_at is not null),
  check (status <> 'simulated' or is_demo),
  check (not (is_demo and status = 'succeeded'))
);
-- At most one live job per target.
create unique index publishing_jobs_one_live_per_target on public.publishing_jobs (target_id)
  where status in ('pending', 'running');
create index publishing_jobs_due_idx on public.publishing_jobs (run_at) where status = 'pending';
create index publishing_jobs_running_idx on public.publishing_jobs (locked_at) where status = 'running';
create index publishing_jobs_workspace_idx on public.publishing_jobs (workspace_id, created_at desc);
create index publishing_jobs_problem_idx on public.publishing_jobs (updated_at desc) where status in ('failed', 'blocked');

create trigger publishing_jobs_updated_at before update on public.publishing_jobs
  for each row execute function app.set_updated_at();
create trigger publishing_jobs_demo_flag before insert or update on public.publishing_jobs
  for each row execute function app.inherit_demo_flag();

-- -----------------------------------------------------------------------------
-- Post status is derived from its targets.
-- -----------------------------------------------------------------------------
create function app.refresh_post_status(p_post_id uuid)
returns public.post_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.post_status;
  v_total integer;
  v_published integer;
  v_simulated integer;
  v_problem integer;
  v_in_flight integer;
  v_waiting integer;
  v_next public.post_status;
  v_published_at timestamptz;
begin
  select status into v_current from public.content_posts where id = p_post_id for update;
  if v_current is null or v_current = 'archived' then
    return v_current;
  end if;

  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'published'),
    count(*) filter (where status = 'simulated'),
    count(*) filter (where status in ('failed', 'blocked')),
    count(*) filter (where status in ('queued', 'publishing')),
    count(*) filter (where status = 'scheduled'),
    max(published_at)
  into v_total, v_published, v_simulated, v_problem, v_in_flight, v_waiting, v_published_at
  from public.post_platform_targets where post_id = p_post_id;

  v_next := case
    when v_total = 0 then v_current
    when v_in_flight > 0 then 'publishing'
    when v_published = v_total then 'published'
    when v_simulated = v_total then 'simulated'
    when v_published > 0 and v_waiting = 0 then 'partially_published'
    when v_waiting > 0 then 'scheduled'
    when v_problem > 0 then 'failed'
    else v_current
  end;


  update public.content_posts
    set status = v_next,
        published_at = case when v_next in ('published', 'partially_published') then v_published_at else published_at end
    where id = p_post_id and status is distinct from v_next;
  return v_next;
end
$$;

-- -----------------------------------------------------------------------------
-- Schedule / unschedule / retry (called by editors through the API role)
-- -----------------------------------------------------------------------------
create function app.schedule_post(p_post_id uuid, p_scheduled_at timestamptz, p_timezone text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_post public.content_posts%rowtype;
  v_org uuid;
  v_limit integer;
  v_jobs integer;
  v_newly boolean;
begin
  select * into v_post from public.content_posts where id = p_post_id and deleted_at is null for update;
  if v_post.id is null or app.workspace_role_rank(v_post.workspace_id) < 3 then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_post.status not in ('draft', 'ready', 'scheduled') then
    raise exception 'transition:post_not_schedulable' using errcode = 'P0001';
  end if;
  if p_scheduled_at <= now() + interval '1 minute' then
    raise exception 'invalid:schedule_in_past' using errcode = 'P0001';
  end if;
  if p_scheduled_at > now() + interval '400 days' then
    raise exception 'invalid:schedule_too_far' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.post_platform_targets where post_id = p_post_id and status <> 'cancelled') then
    raise exception 'invalid:no_targets' using errcode = 'P0001';
  end if;

  select organization_id into v_org from public.workspaces where id = v_post.workspace_id;
  v_newly := v_post.status <> 'scheduled';

  if v_newly and not v_post.is_demo then
    perform app.lock_organization_subscription(v_org);
    v_limit := app.plan_limit(v_org, 'scheduled_posts_per_month');
    if v_limit is not null and app.monthly_usage(v_org, 'post_scheduled') >= v_limit then
      raise exception 'limit_exceeded:scheduled_posts_per_month' using errcode = 'P0001';
    end if;
  end if;

  -- Rescheduling replaces any live job.
  update public.publishing_jobs set status = 'cancelled', completed_at = now(), last_error = 'Rescheduled'
    where post_id = p_post_id and status = 'pending';

  insert into public.publishing_jobs (workspace_id, post_id, target_id, idempotency_key, status, run_at, created_by)
  select t.workspace_id, t.post_id, t.id,
         'publish:' || t.id || ':' || floor(extract(epoch from p_scheduled_at))::bigint,
         'pending', p_scheduled_at, v_user
  from public.post_platform_targets t
  where t.post_id = p_post_id and t.status not in ('published', 'simulated', 'cancelled')
  on conflict (idempotency_key) do update
    set status = 'pending', run_at = excluded.run_at, attempts = 0, last_error = null, error_code = null,
        locked_at = null, locked_by = null, completed_at = null
    where public.publishing_jobs.status = 'cancelled';
  get diagnostics v_jobs = row_count;

  update public.post_platform_targets set status = 'scheduled', last_error = null
    where post_id = p_post_id and status not in ('published', 'simulated', 'cancelled');

  update public.content_posts
    set status = 'scheduled', scheduled_at = p_scheduled_at, schedule_timezone = p_timezone, updated_by = v_user
    where id = p_post_id;

  if v_newly then
    insert into public.usage_records (organization_id, workspace_id, user_id, metric, is_demo, metadata)
    values (v_org, v_post.workspace_id, v_user, 'post_scheduled', v_post.is_demo, jsonb_build_object('post_id', p_post_id));
  end if;

  return v_jobs;
end
$$;

create function app.unschedule_post(p_post_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_post public.content_posts%rowtype;
begin
  select * into v_post from public.content_posts where id = p_post_id and deleted_at is null for update;
  if v_post.id is null or app.workspace_role_rank(v_post.workspace_id) < 3 then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_post.status <> 'scheduled' then
    raise exception 'transition:post_not_scheduled' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.publishing_jobs where post_id = p_post_id and status = 'running') then
    raise exception 'transition:post_publishing' using errcode = 'P0001';
  end if;
  update public.publishing_jobs set status = 'cancelled', completed_at = now(), last_error = 'Unscheduled'
    where post_id = p_post_id and status = 'pending';
  update public.post_platform_targets set status = 'pending' where post_id = p_post_id and status = 'scheduled';
  update public.content_posts set status = 'ready', scheduled_at = null, schedule_timezone = null, updated_by = v_user
    where id = p_post_id;
end
$$;

-- Requeues a failed or blocked job. The caller is warned in the UI when the
-- failure had an unknown outcome (the provider may already have published).
create function app.retry_publishing_job(p_job_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_job public.publishing_jobs%rowtype;
begin
  select * into v_job from public.publishing_jobs where id = p_job_id for update;
  if v_job.id is null or app.workspace_role_rank(v_job.workspace_id) < 3 then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_job.status not in ('failed', 'blocked') then
    raise exception 'transition:job_not_retryable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.publishing_jobs where target_id = v_job.target_id and status in ('pending', 'running')) then
    raise exception 'conflict:job_already_queued' using errcode = 'P0001';
  end if;
  update public.publishing_jobs
    set status = 'pending', run_at = now(), attempts = 0, last_error = null, error_code = null,
        locked_at = null, locked_by = null, completed_at = null
    where id = p_job_id;
  update public.post_platform_targets set status = 'scheduled', last_error = null where id = v_job.target_id;
  perform app.refresh_post_status(v_job.post_id);
end
$$;

-- -----------------------------------------------------------------------------
-- Worker functions (privileged connection only)
-- -----------------------------------------------------------------------------
create function app.claim_publishing_jobs(p_worker text, p_limit integer default 10)
returns setof public.publishing_jobs
language plpgsql
volatile
set search_path = ''
as $$
begin
  return query
  with due as (
    select id from public.publishing_jobs
    where status = 'pending' and run_at <= now()
    order by run_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.publishing_jobs j
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
    from due
   where j.id = due.id
  returning j.*;
end
$$;

-- A job stuck in `running` past the timeout has an unknown outcome: the
-- provider may have published. It is failed, never retried automatically.
create function app.recover_stale_jobs(p_timeout interval default interval '15 minutes')
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    update public.publishing_jobs
       set status = 'failed', error_code = 'outcome_unknown', completed_at = now(),
           last_error = 'The worker stopped before the provider responded. Check the platform before retrying.'
     where status = 'running' and locked_at < now() - p_timeout
    returning target_id, post_id
  loop
    update public.post_platform_targets set status = 'failed',
      last_error = 'Outcome unknown: check the platform before retrying.' where id = r.target_id;
    perform app.refresh_post_status(r.post_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- Archiving or deleting a post cancels anything still queued for it.
create function app.cancel_jobs_for_inactive_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null) or (new.status = 'archived' and old.status <> 'archived') then
    update public.publishing_jobs set status = 'cancelled', completed_at = now(),
      last_error = case when new.deleted_at is not null then 'Post deleted' else 'Post archived' end
      where post_id = new.id and status = 'pending';
    update public.post_platform_targets set status = 'cancelled'
      where post_id = new.id and status in ('pending', 'scheduled', 'queued');
  end if;
  return null;
end
$$;

create trigger content_posts_cancel_jobs after update of deleted_at, status on public.content_posts
  for each row execute function app.cancel_jobs_for_inactive_post();

-- Deleting a workspace cancels its queue.
create function app.cancel_jobs_for_deleted_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.publishing_jobs set status = 'cancelled', completed_at = now(), last_error = 'Workspace deleted'
      where workspace_id = new.id and status = 'pending';
  end if;
  return null;
end
$$;

create trigger workspaces_cancel_jobs after update of deleted_at on public.workspaces
  for each row execute function app.cancel_jobs_for_deleted_workspace();

grant execute on function
  app.schedule_post(uuid, timestamptz, text),
  app.unschedule_post(uuid),
  app.retry_publishing_job(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Analytics snapshots. NULL means "not available", never zero.
-- -----------------------------------------------------------------------------
create type public.analytics_source as enum ('demo', 'manual_import', 'provider_sync');

create table public.analytics_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  social_account_id uuid not null,
  -- Post-level rows reference the target that was published.
  target_id uuid references public.post_platform_targets (id) on delete cascade,
  platform public.social_platform not null,
  metric_date date not null,
  data_source public.analytics_source not null,
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  posts_count bigint check (posts_count >= 0),
  impressions bigint check (impressions >= 0),
  reach bigint check (reach >= 0),
  views bigint check (views >= 0),
  profile_views bigint check (profile_views >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  clicks bigint check (clicks >= 0),
  watch_time_seconds bigint check (watch_time_seconds >= 0),
  raw jsonb not null default '{}' check (jsonb_typeof(raw) = 'object' and pg_column_size(raw) < 16384),
  captured_at timestamptz not null default now(),
  import_batch_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, social_account_id) references public.social_accounts (workspace_id, id) on delete cascade,
  -- Demo numbers only ever live in demo workspaces, and vice versa.
  constraint analytics_demo_source check ((data_source = 'demo') = is_demo)
);
create unique index analytics_account_day_unique on public.analytics_snapshots (social_account_id, metric_date, data_source)
  where target_id is null;
create unique index analytics_post_day_unique on public.analytics_snapshots (target_id, metric_date, data_source)
  where target_id is not null;
create index analytics_workspace_date_idx on public.analytics_snapshots (workspace_id, metric_date desc);

create trigger analytics_snapshots_demo_flag before insert or update on public.analytics_snapshots
  for each row execute function app.inherit_demo_flag();

-- -----------------------------------------------------------------------------
-- AI generation history
-- -----------------------------------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  task text not null check (task in ('caption', 'hooks', 'ideas', 'hashtags', 'campaign', 'adapt')),
  provider text not null check (char_length(provider) <= 40),
  model text check (model is null or char_length(model) <= 80),
  -- True when the demo provider produced the output (no AI model was used).
  is_demo_output boolean not null,
  input jsonb not null check (jsonb_typeof(input) = 'object' and pg_column_size(input) < 16384),
  output jsonb not null check (pg_column_size(output) < 65536),
  created_at timestamptz not null default now()
);
create index ai_generations_workspace_idx on public.ai_generations (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.publishing_jobs enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.ai_generations enable row level security;
revoke all on public.publishing_jobs, public.analytics_snapshots, public.ai_generations from anon, authenticated;

grant select on public.publishing_jobs to authenticated;
create policy publishing_jobs_select on public.publishing_jobs for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)));

grant select on public.analytics_snapshots to authenticated;
create policy analytics_snapshots_select on public.analytics_snapshots for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(1)));

grant select on public.ai_generations to authenticated;
create policy ai_generations_select on public.ai_generations for select to authenticated
  using (workspace_id in (select app.accessible_workspace_ids(2)));
