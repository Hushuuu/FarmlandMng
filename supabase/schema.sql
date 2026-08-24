-- ============================================================
-- 果園管理系統 Schema v1
-- 於 Supabase SQL Editor 執行本檔案即可完成資料庫建置
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Profiles（對應 auth.users）
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(100),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 建立使用者時自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 共用：updated_at 自動更新
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- tree_types 果樹類型
-- ------------------------------------------------------------
create table if not exists public.tree_types (
  id          uuid primary key default gen_random_uuid(),
  code        varchar(50) not null unique,
  name        varchar(100) not null,
  description text,
  icon        varchar(16) default '🌳',
  color       varchar(16) default '#4caf50',
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_tree_types_updated_at on public.tree_types;
create trigger trg_tree_types_updated_at before update on public.tree_types
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- orchards 果園
-- ------------------------------------------------------------
create table if not exists public.orchards (
  id          uuid primary key default gen_random_uuid(),
  code        varchar(50) not null unique,
  name        varchar(100) not null,
  description text,
  map_width   numeric not null default 2000,
  map_height  numeric not null default 1200,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_orchards_updated_at on public.orchards;
create trigger trg_orchards_updated_at before update on public.orchards
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- areas 區域
-- ------------------------------------------------------------
create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  orchard_id  uuid not null references public.orchards(id) on delete cascade,
  code        varchar(50) not null,
  name        varchar(100) not null,
  description text,
  position_x  numeric not null default 100,
  position_y  numeric not null default 100,
  width       numeric not null default 300,
  height      numeric not null default 220,
  rotation    numeric not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (orchard_id, code)
);

create index if not exists idx_areas_orchard on public.areas(orchard_id);

drop trigger if exists trg_areas_updated_at on public.areas;
create trigger trg_areas_updated_at before update on public.areas
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- trees 果樹
-- ------------------------------------------------------------
create table if not exists public.trees (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  tree_type_id uuid references public.tree_types(id) on delete set null,
  code         varchar(50) not null,
  name         varchar(100),
  position_x   numeric not null default 100,
  position_y   numeric not null default 100,
  status       varchar(20) not null default 'NORMAL',
  planted_at   date,
  note         text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (area_id, code)
);

create index if not exists idx_trees_area on public.trees(area_id);
create index if not exists idx_trees_type on public.trees(tree_type_id);

drop trigger if exists trg_trees_updated_at on public.trees;
create trigger trg_trees_updated_at before update on public.trees
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- task_categories 任務類別
-- ------------------------------------------------------------
create table if not exists public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  code        varchar(50) not null unique,
  name        varchar(100) not null,
  description text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_task_categories_updated_at on public.task_categories;
create trigger trg_task_categories_updated_at before update on public.task_categories
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- tasks 任務設定
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  code        varchar(50) not null unique,
  name        varchar(100) not null,
  category_id uuid references public.task_categories(id) on delete set null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- task_assignments 任務排程（指定對象 + 週期）
-- target_type: ORCHARD / AREA / TREE
-- recurrence_unit: DAY / WEEK / MONTH；NULL 表示無週期（單次任務）
-- ------------------------------------------------------------
create table if not exists public.task_assignments (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  target_type      varchar(10) not null check (target_type in ('ORCHARD','AREA','TREE')),
  target_id        uuid not null,
  start_date       date not null default current_date,
  next_start_date  date,
  recurrence_value integer check (recurrence_value is null or recurrence_value > 0),
  recurrence_unit  varchar(10) check (recurrence_unit in ('DAY','WEEK','MONTH')),
  active           boolean not null default true,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_assignments_task on public.task_assignments(task_id);
create index if not exists idx_assignments_target on public.task_assignments(target_type, target_id);

drop trigger if exists trg_assignments_updated_at on public.task_assignments;
create trigger trg_assignments_updated_at before update on public.task_assignments
  for each row execute function public.set_updated_at();

-- 已建立過舊版資料表時，補上可調整的下一輪預計開始日。
alter table public.task_assignments
  add column if not exists next_start_date date;

-- ------------------------------------------------------------
-- task_execution_batches 執行批次
-- status: IN_PROGRESS / COMPLETED / CANCELLED
-- ------------------------------------------------------------
create table if not exists public.task_execution_batches (
  id                 uuid primary key default gen_random_uuid(),
  task_assignment_id uuid not null references public.task_assignments(id) on delete cascade,
  scheduled_date     date not null default current_date,
  started_at         timestamptz,
  completed_at       timestamptz,
  status             varchar(20) not null default 'IN_PROGRESS'
                     check (status in ('IN_PROGRESS','COMPLETED','CANCELLED')),
  note               text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_batches_assignment on public.task_execution_batches(task_assignment_id);
create index if not exists idx_batches_status on public.task_execution_batches(status);

drop trigger if exists trg_batches_updated_at on public.task_execution_batches;
create trigger trg_batches_updated_at before update on public.task_execution_batches
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- task_execution_items 執行項目（實際落到 Tree 層級）
-- status: PENDING / COMPLETED / SKIPPED / FAILED
-- ------------------------------------------------------------
create table if not exists public.task_execution_items (
  id                 uuid primary key default gen_random_uuid(),
  execution_batch_id uuid not null references public.task_execution_batches(id) on delete cascade,
  tree_id            uuid not null references public.trees(id),
  status             varchar(20) not null default 'PENDING'
                     check (status in ('PENDING','COMPLETED','SKIPPED','FAILED')),
  executed_at        timestamptz,
  operator_id        uuid references auth.users(id) on delete set null,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_items_batch on public.task_execution_items(execution_batch_id);
create index if not exists idx_items_tree on public.task_execution_items(tree_id);
create index if not exists idx_items_status on public.task_execution_items(status);

drop trigger if exists trg_items_updated_at on public.task_execution_items;
create trigger trg_items_updated_at before update on public.task_execution_items
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- system_settings 系統設定
-- ------------------------------------------------------------
create table if not exists public.system_settings (
  key         varchar(100) primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_settings_updated_at on public.system_settings;
create trigger trg_settings_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS：所有業務資料表啟用 RLS，登入使用者可完整操作（第一版單一權限）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'tree_types','orchards','areas','trees','task_categories',
    'tasks','task_assignments','task_execution_batches','task_execution_items','system_settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_select" on public.%I;', t, t);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (true);', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I;', t, t);
    execute format('create policy "%s_insert" on public.%I for insert to authenticated with check (true);', t, t);
    execute format('drop policy if exists "%s_update" on public.%I;', t, t);
    execute format('create policy "%s_update" on public.%I for update to authenticated using (true) with check (true);', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I;', t, t);
    execute format('create policy "%s_delete" on public.%I for delete to authenticated using (true);', t, t);
  end loop;
end $$;

-- ============================================================
-- Dashboard 統計 View（§49：由 View 計算，不保存快取欄位）
-- ============================================================
create or replace view public.v_orchard_stats with (security_invoker = true) as
select
  o.id                                        as orchard_id,
  o.name                                      as orchard_name,
  count(distinct a.id) filter (where a.active) as area_count,
  count(t.id) filter (where t.active)          as tree_count
from public.orchards o
left join public.areas a on a.orchard_id = o.id
left join public.trees t on t.area_id = a.id
group by o.id, o.name;

create or replace view public.v_area_stats with (security_invoker = true) as
select
  a.id              as area_id,
  a.orchard_id      as orchard_id,
  a.name            as area_name,
  count(t.id) filter (where t.active) as tree_count
from public.areas a
left join public.trees t on t.area_id = a.id
group by a.id, a.orchard_id, a.name;

-- ============================================================
-- 種子資料
-- ============================================================
insert into public.tree_types (code, name, sort_order) values
  ('MANGO',    '芒果', 1),
  ('GUAVA',    '芭樂', 2),
  ('LYCHEE',   '荔枝', 3),
  ('LONGAN',   '龍眼', 4),
  ('POMELO',   '柚子', 5)
on conflict (code) do nothing;

insert into public.task_categories (code, name, sort_order) values
  ('FERTILIZE', '施肥', 1),
  ('PESTICIDE', '農藥', 2),
  ('WATER',     '澆水', 3),
  ('PRUNE',     '修剪', 4),
  ('WEEDING',   '除草', 5),
  ('HARVEST',   '採收', 6),
  ('PATROL',    '巡視', 7),
  ('OTHER',     '其他', 8)
on conflict (code) do nothing;

insert into public.system_settings (key, value, description) values
  ('default_map_width',      '2000', '新果園預設地圖寬度'),
  ('default_map_height',     '1200', '新果園預設地圖高度'),
  ('task_due_warning_days',  '3',    '任務即將到期警示天數')
on conflict (key) do nothing;
