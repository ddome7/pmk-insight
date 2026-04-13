-- 매니저 에이전트 테이블
-- 각 매니저(유저)별 AI 에이전트 페르소나 저장
-- 인사이트 생성 시 에이전트 페르소나가 AI 시스템 프롬프트에 주입됨

create table if not exists manager_agents (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  manager_name text        not null,
  persona      text        default '' not null,
  created_at   timestamptz default now() not null,
  unique(user_id, manager_name)
);

alter table manager_agents enable row level security;

create policy "manager_agents_owner_policy"
  on manager_agents for all
  using (user_id = auth.uid());
