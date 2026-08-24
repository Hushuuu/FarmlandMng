-- ============================================================================
-- 硬刪除工具（Hard Delete）
-- ============================================================================
--
-- ⚠️⚠️⚠️ 重要警告 ⚠️⚠️⚠️
-- 本檔案的所有 DELETE / TRUNCATE 都是「實體刪除」，執行後資料無法復原。
-- 系統介面上的刪除全部是軟刪除（active = false），歷史紀錄會保留；
-- 只有在 Supabase SQL Editor 手動執行本檔案，資料才會真正消失。
-- 執行前建議：Supabase Dashboard → Database → Backups 先建立備份。
--
-- 使用方式：
--   到 Supabase Dashboard → SQL Editor，貼上「單一段落」執行。
--   有 <REPLACE_ME> 的地方要換成實際 UUID（可先用各段的「事前查詢」找出 id）。
--
-- 資料表關聯（由上而下刪除才不會被 FK 擋住）：
--   task_execution_items（逐樹執行紀錄）
--     └─ task_execution_batches（執行批次）
--          └─ task_assignments（任務排程）
--               └─ tasks（任務設定）
--   trees（果樹）→ areas（區域）→ orchards（果園）
--
-- ============================================================================


-- ============================================================================
-- 第 0 節：事前盤點（唯讀，放心執行）
-- ----------------------------------------------------------------------------
-- 對應功能：果園列表「停用」、地圖編輯模式「刪除區域／刪除果樹」、
--           任務設定「停用／刪除排程」——這些動作都只是 active = false。
-- 用途：先看看有多少軟刪除的資料躺在資料庫裡。
-- ============================================================================
select 'orchards（停用果園）' as 項目, count(*) as 筆數 from orchards where not active
union all
select 'areas（停用區域）', count(*) from areas where not active
union all
select 'trees（停用果樹）', count(*) from trees where not active
union all
select 'tasks（停用任務）', count(*) from tasks where not active
union all
select 'task_assignments（停用排程）', count(*) from task_assignments where not active
union all
select 'tree_types（停用類型）', count(*) from tree_types where not active
union all
select 'task_categories（停用類別）', count(*) from task_categories where not active;

-- 列出停用的果園（取得 id 用）
select id, code, name, updated_at from orchards where not active order by updated_at desc;

-- 列出停用的區域（取得 id 用）
select a.id, a.code, a.name, o.name as orchard_name, a.updated_at
from areas a join orchards o on o.id = a.orchard_id
where not a.active order by a.updated_at desc;

-- 列出停用的果樹（取得 id 用）
select t.id, t.code, t.name, ar.name as area_name, t.updated_at
from trees t join areas ar on ar.id = t.area_id
where not t.active order by t.updated_at desc;


-- ============================================================================
-- 第 1 節：【安全模式】只清除「沒有歷史包袱」的停用資料（建議優先使用）
-- ----------------------------------------------------------------------------
-- 對應功能：一般操作中誤建又停用的果園／區域／果樹。
-- 規則：
--   果樹 → 從未被任何執行紀錄（task_execution_items）引用過才刪。
--   區域 → 底下已完全沒有果樹（含停用果樹）才刪。
--   果園 → 底下已完全沒有區域（含停用區域）才刪。
-- 效果：所有任務歷史 100% 保留；只是把「孤兒」清掉。
-- ============================================================================
begin;

-- 1-1) 沒有任何執行紀錄引用的停用果樹
delete from trees
where not active
  and not exists (select 1 from task_execution_items i where i.tree_id = trees.id);

-- 1-2) 底下已經沒有果樹的停用區域
delete from areas
where not active
  and not exists (select 1 from trees t where t.area_id = areas.id);

-- 1-3) 底下已經沒有區域的停用果園
delete from orchards
where not active
  and not exists (select 1 from areas a where a.orchard_id = orchards.id);

commit;


-- ============================================================================
-- 第 2 節：完整刪除「單一果園」（連同底下所有東西與任務歷史一起消失）
-- ----------------------------------------------------------------------------
-- 對應功能：整座果園不要了，連過去的施肥/噴藥紀錄也不留。
-- 影響範圍：果園本身 + 全部區域 + 全部果樹 +
--           針對此果園／其區域／其果樹的所有排程、執行批次、逐樹紀錄。
-- 使用前：先把 <ORCHARD_ID> 換成第 0 節查到的 id。
-- ============================================================================
-- 事前確認是哪一座果園（唯讀）：
-- select id, code, name from orchards where id = '<ORCHARD_ID>';

begin;
-- 刪除順序不可顛倒：items → batches → assignments → trees → areas → orchard

delete from task_execution_items
where execution_batch_id in (
  select b.id from task_execution_batches b
  join task_assignments a on a.id = b.task_assignment_id
  where (a.target_type = 'ORCHARD' and a.target_id = '<ORCHARD_ID>')
     or (a.target_type = 'AREA' and a.target_id in (select id from areas where orchard_id = '<ORCHARD_ID>'))
     or (a.target_type = 'TREE' and a.target_id in (select id from trees where area_id in (select id from areas where orchard_id = '<ORCHARD_ID>')))
);

delete from task_execution_batches
where task_assignment_id in (
  select id from task_assignments
  where (target_type = 'ORCHARD' and target_id = '<ORCHARD_ID>')
     or (target_type = 'AREA' and target_id in (select id from areas where orchard_id = '<ORCHARD_ID>'))
     or (target_type = 'TREE' and target_id in (select id from trees where area_id in (select id from areas where orchard_id = '<ORCHARD_ID>')))
);

delete from task_assignments
where (target_type = 'ORCHARD' and target_id = '<ORCHARD_ID>')
   or (target_type = 'AREA' and target_id in (select id from areas where orchard_id = '<ORCHARD_ID>'))
   or (target_type = 'TREE' and target_id in (select id from trees where area_id in (select id from areas where orchard_id = '<ORCHARD_ID>')));

delete from trees      where area_id    in (select id from areas where orchard_id = '<ORCHARD_ID>');
delete from areas      where orchard_id = '<ORCHARD_ID>';
delete from orchards   where id         = '<ORCHARD_ID>';
commit;


-- ============================================================================
-- 第 3 節：完整刪除「單一區域」（連同底下果樹與相關任務歷史一起消失）
-- ----------------------------------------------------------------------------
-- 對應功能：地圖編輯模式裡「刪除區域」的徹底版。
-- 影響範圍：區域本身 + 底下全部果樹 + 針對此區域／其果樹的排程與歷史。
-- 注意：不會動到「果園層級」的排程（那些排程還在，只是此區不再參與）。
-- ============================================================================
begin;
delete from task_execution_items
where execution_batch_id in (
  select b.id from task_execution_batches b
  join task_assignments a on a.id = b.task_assignment_id
  where (a.target_type = 'AREA' and a.target_id = '<AREA_ID>')
     or (a.target_type = 'TREE' and a.target_id in (select id from trees where area_id = '<AREA_ID>'))
);

delete from task_execution_batches
where task_assignment_id in (
  select id from task_assignments
  where (target_type = 'AREA' and target_id = '<AREA_ID>')
     or (target_type = 'TREE' and target_id in (select id from trees where area_id = '<AREA_ID>'))
);

delete from task_assignments
where (target_type = 'AREA' and target_id = '<AREA_ID>')
   or (target_type = 'TREE' and target_id in (select id from trees where area_id = '<AREA_ID>'));

delete from trees where area_id = '<AREA_ID>';
delete from areas where id = '<AREA_ID>';
commit;


-- ============================================================================
-- 第 4 節：完整刪除「單一棵果樹」（連同這棵樹的所有執行歷史一起消失）
-- ----------------------------------------------------------------------------
-- 對應功能：果樹管理頁「停用」的徹底版。
-- 注意：這棵樹過去的逐樹紀錄會消失，批次上的「完成數」會跟著變少，
--       歷史頁可能從「118/120」變成「117/119」。通常建議只用軟刪除就好。
-- ============================================================================
begin;
-- 4-1) 刪除針對這棵樹的排程（含其批次與項目）
delete from task_execution_items
where execution_batch_id in (
  select b.id from task_execution_batches b
  join task_assignments a on a.id = b.task_assignment_id
  where a.target_type = 'TREE' and a.target_id = '<TREE_ID>'
);
delete from task_execution_batches
where task_assignment_id in (
  select id from task_assignments where target_type = 'TREE' and target_id = '<TREE_ID>'
);
delete from task_assignments where target_type = 'TREE' and target_id = '<TREE_ID>';

-- 4-2) 刪除這棵樹在其他批次（如區域級任務）中的逐樹紀錄
delete from task_execution_items where tree_id = '<TREE_ID>';

-- 4-3) 刪除果樹本身
delete from trees where id = '<TREE_ID>';
commit;


-- ============================================================================
-- 第 5 節：清空所有業務資料（保留主檔與系統設定）
-- ----------------------------------------------------------------------------
-- 對應功能：「我想要重來」，例如測試期結束、正式上线前清空示範資料。
-- 保留：tree_types（果樹類型）、task_categories（任務類別）、
--       system_settings（系統設定）、profiles（使用者）、auth.users（帳號）。
-- 清空：orchards / areas / trees / tasks / task_assignments /
--       task_execution_batches / task_execution_items（及其全部歷史）。
-- ============================================================================
begin;
truncate table task_execution_items,
               task_execution_batches,
               task_assignments,
               tasks,
               trees,
               areas,
               orchards;
commit;
-- TRUNCATE 需在同一語句列出所有互相參考的資料表，以上順序即為正確組合。
