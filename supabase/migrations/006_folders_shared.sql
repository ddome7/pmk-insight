-- 폴더 전체 공유 정책
--
-- 배경:
-- 기존 folders 테이블은 user_id 기반 단일 정책으로 본인이 만든 폴더만 보였다.
-- 요구사항: 누가 만들든 모든 매니저가 동일한 폴더 트리를 공유해야 한다.
--
-- 변경 내용:
-- 1) 기존 owner-only 정책 전부 제거
-- 2) SELECT/INSERT/UPDATE/DELETE 를 인증된 사용자 전체에게 허용
-- 3) user_id 컬럼은 NOT NULL 제약을 풀어 향후 NULL 삽입도 허용
--    (기존 데이터는 그대로 두되, 클라이언트는 user_id를 더 이상 보내지 않음)

-- 1) 기존 정책 모두 제거 (이름이 다를 수 있어 광역으로 처리)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'folders'
  loop
    execute format('drop policy if exists %I on public.folders', pol.policyname);
  end loop;
end$$;

-- 2) RLS 활성화 보장
alter table public.folders enable row level security;

-- 3) 새 공유 정책 — 인증된 사용자 누구나 읽기·생성·수정·삭제 가능
create policy "folders_shared_select" on public.folders
  for select using (auth.role() = 'authenticated');

create policy "folders_shared_insert" on public.folders
  for insert with check (auth.role() = 'authenticated');

create policy "folders_shared_update" on public.folders
  for update using (auth.role() = 'authenticated');

create policy "folders_shared_delete" on public.folders
  for delete using (auth.role() = 'authenticated');

-- 4) user_id NOT NULL 해제 (있을 경우에만)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'folders'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.folders alter column user_id drop not null;
  end if;
end$$;
