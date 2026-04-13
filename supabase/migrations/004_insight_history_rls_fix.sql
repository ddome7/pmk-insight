-- insight_history RLS 정책 수정
-- 기존 단일 정책(소유자 전용)을 SELECT/INSERT/DELETE 분리하여
-- 관리자도 삭제 가능하게 업데이트

drop policy if exists "insight_history_owner_policy" on insight_history;

-- SELECT: 인증된 사용자 전체 (공유 광고주 열람 지원)
create policy "insight_history_select" on insight_history
  for select using (auth.role() = 'authenticated');

-- INSERT: 인증된 사용자 전체 (어떤 광고주든 인사이트 생성 가능)
create policy "insight_history_insert" on insight_history
  for insert with check (auth.role() = 'authenticated');

-- DELETE: 광고주 소유자 또는 관리자
create policy "insight_history_delete" on insight_history
  for delete using (
    exists (
      select 1 from advertisers
      where advertisers.id = insight_history.advertiser_id
        and advertisers.user_id = auth.uid()
    )
    or exists (select 1 from admins where user_id = auth.uid())
  );
