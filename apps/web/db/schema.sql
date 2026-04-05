-- Vouch database schema
-- IMPORTANT: No raw user content stored here. Only behavioral metadata.

create extension if not exists "pgcrypto";

-- Projects
create table vouch_projects (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique not null
                          check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'),
  name        text        not null,
  created_at  timestamptz default now()
);

-- Action logs
create table vouch_action_logs (
  id                uuid        primary key,
  project_id        uuid        not null references vouch_projects(id) on delete cascade,
  action_type       text        not null,
  verdict           text        not null check (verdict in ('PASS','BLOCK','CONFIRM')),
  user_decision     text        check (user_decision in ('CONFIRMED','CANCELLED')),
  policy_triggered  text        not null,
  block_reason      text,
  duration_ms       integer     not null check (duration_ms >= 0),
  created_at        timestamptz default now()
);

-- Indexes
create index idx_logs_project_time     on vouch_action_logs (project_id, created_at desc);
create index idx_logs_project_verdict  on vouch_action_logs (project_id, verdict);
create index idx_logs_project_policy   on vouch_action_logs (project_id, policy_triggered);
create index idx_logs_project_action   on vouch_action_logs (project_id, action_type);

-- Dashboard views
create view vouch_project_stats as
select
  p.id                                                                           as project_id,
  p.slug,
  p.name,
  count(l.id)                                                                    as total_runs,
  count(l.id) filter (where l.verdict = 'PASS')                                 as pass_count,
  count(l.id) filter (where l.verdict = 'BLOCK')                                as block_count,
  count(l.id) filter (where l.verdict = 'CONFIRM')                              as confirm_count,
  count(l.id) filter (where l.verdict = 'CONFIRM' and l.user_decision = 'CONFIRMED') as confirmed_count,
  count(l.id) filter (where l.verdict = 'CONFIRM' and l.user_decision = 'CANCELLED') as cancelled_count,
  round(
    count(l.id) filter (where l.verdict = 'PASS')::numeric /
    nullif(count(l.id), 0) * 100, 1
  )                                                                              as pass_rate,
  max(l.created_at)                                                              as last_run_at
from vouch_projects p
left join vouch_action_logs l on l.project_id = p.id
group by p.id, p.slug, p.name;

create view vouch_policy_breakdown as
select
  project_id,
  policy_triggered,
  count(*)                                                                       as total_runs,
  count(*) filter (where verdict = 'PASS')                                      as pass_count,
  count(*) filter (where verdict = 'BLOCK')                                     as block_count,
  count(*) filter (where verdict = 'CONFIRM')                                   as confirm_count,
  round(
    count(*) filter (where verdict = 'PASS')::numeric / nullif(count(*), 0) * 100, 1
  )                                                                              as pass_rate
from vouch_action_logs
group by project_id, policy_triggered;

create view vouch_daily_pass_rate as
select
  project_id,
  date_trunc('day', created_at)                                                  as day,
  round(
    count(*) filter (where verdict = 'PASS')::numeric / nullif(count(*), 0) * 100, 1
  )                                                                              as pass_rate,
  count(*)                                                                       as total_runs
from vouch_action_logs
where created_at >= now() - interval '30 days'
group by project_id, date_trunc('day', created_at)
order by project_id, day;

-- Row Level Security
alter table vouch_projects    enable row level security;
alter table vouch_action_logs enable row level security;

-- Public read (dashboard is public)
create policy "public read projects"
  on vouch_projects for select using (true);

create policy "public read logs"
  on vouch_action_logs for select using (true);

-- Write via service_role only (ingest API uses service key)
create policy "service insert logs"
  on vouch_action_logs for insert
  with check (auth.role() = 'service_role');

create policy "service insert projects"
  on vouch_projects for insert
  with check (auth.role() = 'service_role');
