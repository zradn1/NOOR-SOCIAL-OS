-- =============================================================================
-- Planned dates for drafts. A planning aid for the calendar only: it never
-- creates publishing jobs (scheduling still goes through app.schedule_post).
-- =============================================================================
alter table public.content_posts add column planned_for timestamptz;
create index content_posts_workspace_planned_idx on public.content_posts (workspace_id, planned_for)
  where deleted_at is null and planned_for is not null;

grant insert (planned_for) on public.content_posts to authenticated;
grant update (planned_for) on public.content_posts to authenticated;
