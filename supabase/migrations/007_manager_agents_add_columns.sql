-- manager_agents 테이블에 agent_name, tone 컬럼 추가
--
-- 배경:
-- 002_manager_agents.sql 에는 persona 컬럼만 있었으나,
-- 코드(api/agent/route.ts, api/insight/route.ts)는 agent_name, tone 컬럼을
-- INSERT/UPDATE/SELECT 하고 있어 DB 에러 발생.
-- → 에이전트 저장/적용 기능 전체 불가 상태였음.
--
-- 변경 내용:
-- 1) agent_name, tone 컬럼 추가
-- 2) 기존 row의 manager_name이 광고주명으로 오염된 케이스 대비
--    (코드 측에서 upsert 기본값 '매니저'로 통일하는 것으로 처리)

alter table public.manager_agents
  add column if not exists agent_name text default '' not null,
  add column if not exists tone       text default '' not null;
