-- page_feedbacks 테이블
create table if not exists page_feedbacks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  page_id     text not null default 'pmk-insight',
  section     text,
  priority    text not null default 'medium', -- high / medium / low
  content     text not null,
  status      text not null default 'pending', -- pending / in_progress / done
  created_at  timestamptz default now()
);

-- RLS
alter table page_feedbacks enable row level security;

-- 인증된 사용자는 누구나 삽입 가능
create policy "feedback_insert" on page_feedbacks
  for insert to authenticated with check (true);

-- 본인 피드백 조회
create policy "feedback_select_own" on page_feedbacks
  for select to authenticated using (user_id = auth.uid());

-- 어드민은 전체 조회 (admins 테이블 기반)
create policy "feedback_select_admin" on page_feedbacks
  for select to authenticated
  using (exists (select 1 from admins where user_id = auth.uid()));

-- 어드민만 상태 업데이트
create policy "feedback_update_admin" on page_feedbacks
  for update to authenticated
  using (exists (select 1 from admins where user_id = auth.uid()));

-- 어드민 또는 본인만 삭제
create policy "feedback_delete" on page_feedbacks
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from admins where user_id = auth.uid())
  );
