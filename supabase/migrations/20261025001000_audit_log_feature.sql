-- The organization audit log is a plan feature (Pro and above). Enforced in
-- RLS so no API path can read it on plans without the feature. Platform
-- admins read it through the server's privileged connection.
drop policy audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    organization_id in (select app.member_organization_ids(4))
    and app.plan_has_feature(organization_id, 'audit_log')
  );
