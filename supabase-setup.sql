-- ===========================================================
-- AIGC 工具导航 · Supabase 数据库初始化脚本
-- -----------------------------------------------------------
-- 用法：
--   1. 打开 Supabase 控制台 → 左侧 SQL Editor → New query
--   2. 把本文件全部内容粘进去 → 点 Run
--   3. 看到 "Success. No rows returned" 即建表成功
--
-- 说明：脚本可重复执行（用了 if not exists / drop policy if exists）
-- ===========================================================


-- ===========================================================
-- 1. 收藏表
-- ===========================================================
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool_id    text not null,
  created_at timestamptz not null default now(),
  -- 同一用户对同一工具只能收藏一次
  unique (user_id, tool_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);


-- ===========================================================
-- 2. 评论表
-- ===========================================================
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nickname   text,
  tool_id    text not null,
  content    text not null check (char_length(content) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

-- 评论对所有人可见（否则未登录访客看不到）
drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all" on public.comments
  for select using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
  for delete using (auth.uid() = user_id);

create index if not exists comments_tool_idx on public.comments (tool_id, created_at desc);


-- ===========================================================
-- 3. 工具投稿表
-- ===========================================================
create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  url         text not null,
  cat         text not null,
  price       text not null default 'freemium',
  description text not null,
  -- 审核状态：前端不可写，只能由你在后台改
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

alter table public.submissions enable row level security;

-- 用户只能看自己的投稿
drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own" on public.submissions
  for select using (auth.uid() = user_id);

-- 用户只能提交，不能改状态（没有 update 策略 = 无法更新）
drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert with check (auth.uid() = user_id);

create index if not exists submissions_user_idx on public.submissions (user_id, created_at desc);


-- ===========================================================
-- 4. 收藏计数视图（给「收藏最多」排序和卡片数字用）
-- -----------------------------------------------------------
-- 只暴露聚合后的数字，不暴露「谁收藏了什么」
-- ===========================================================
create or replace view public.tool_fav_counts as
  select tool_id, count(*)::int as fav_count
  from public.favorites
  group by tool_id;

grant select on public.tool_fav_counts to anon, authenticated;


-- ===========================================================
-- 5. 检查结果
-- ===========================================================
select 'favorites'   as table_name, count(*) as rows from public.favorites
union all
select 'comments',    count(*) from public.comments
union all
select 'submissions', count(*) from public.submissions;
