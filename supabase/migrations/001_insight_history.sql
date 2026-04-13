-- 인사이트 히스토리 테이블
-- 광고주별 인사이트 생성 결과를 저장하여 AI가 히스토리를 학습에 활용

create table if not exists insight_history (
  id            uuid        default gen_random_uuid() primary key,
  advertiser_id uuid        references advertisers(id) on delete cascade not null,
  analysis_start date       not null,
  analysis_end   date       not null,
  compare_start  date,
  compare_end    date,
  result         jsonb      not null,  -- { insights, nextSteps, report }
  created_at     timestamptz default now() not null
);

create index if not exists insight_history_advertiser_created
  on insight_history(advertiser_id, created_at desc);

alter table insight_history enable row level security;

-- 자신의 광고주에 대한 히스토리만 접근 가능
create policy "insight_history_owner_policy"
  on insight_history for all
  using (
    exists (
      select 1 from advertisers
      where advertisers.id = insight_history.advertiser_id
        and advertisers.user_id = auth.uid()
    )
  );
