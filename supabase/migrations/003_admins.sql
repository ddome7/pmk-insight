-- 어드민 테이블
create table if not exists admins (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null unique,
  email      text        not null,
  granted_by uuid        references auth.users(id),
  created_at timestamptz default now() not null
);

alter table admins enable row level security;

create policy "admins_select_all" on admins
  for select using (auth.role() = 'authenticated');

create policy "admins_insert_by_admin" on admins
  for insert with check (
    exists (select 1 from admins where user_id = auth.uid())
  );

create policy "admins_delete_by_admin" on admins
  for delete using (
    exists (select 1 from admins where user_id = auth.uid())
  );

-- 최초 어드민 등록
insert into admins (user_id, email, granted_by)
select id, email, id from auth.users where email = 'ljm@puzl.co.kr'
on conflict (user_id) do nothing;

-- 광고주 수정·삭제: 어드민도 허용
drop policy if exists "advertisers_update_own" on advertisers;
drop policy if exists "advertisers_delete_own" on advertisers;

create policy "advertisers_update_own_or_admin" on advertisers
  for update using (
    user_id = auth.uid() or
    exists (select 1 from admins where user_id = auth.uid())
  );

create policy "advertisers_delete_own_or_admin" on advertisers
  for delete using (
    user_id = auth.uid() or
    exists (select 1 from admins where user_id = auth.uid())
  );
