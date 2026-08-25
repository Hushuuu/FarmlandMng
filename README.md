# 果園管理系統（FarmlandMng）

以「果園空間配置」與「農務任務管理」為核心的 Web 系統。

技術架構：Vue 3 + TypeScript + Vite + Naive UI + Pinia + Vue Router + Supabase（PostgreSQL / Auth / RLS），Mobile First。

完整規格見 `spec.md`。

## 快速開始

```bash
npm install
npm run dev
```

環境變數放在 `.env`（可參考 `.env.example`）：

```text
VITE_SUPABASE_URL=https://<你的專案ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
VITE_MANAGEMENT_PASSWORD=<管理模式密碼>
```

在「系統設定」輸入管理模式密碼後，才會顯示永久刪除與相關管理操作；解鎖只在目前頁面工作階段有效。注意 `VITE_*` 會被打包到前端，這是防止誤操作的便利門檻，不是伺服器安全邊界；若需要真正的權限隔離，應改由 Supabase Edge Function / RLS 角色在伺服器端驗證。

## 資料庫建置（一次性）

到 Supabase Dashboard → SQL Editor，執行 `supabase/schema.sql` 全部內容。
它會建立：

- 資料表：orchards、areas、trees、tree_types、task_categories、tasks、task_assignments、task_execution_batches、task_execution_items、profiles、system_settings
- RLS 政策（登入使用者可完整操作）
- updated_at 自動更新觸發器
- 建立使用者自動建立 profile 的觸發器
- Dashboard 統計 View（v_orchard_stats / v_area_stats）
- 種子資料（果樹類型、任務類別、系統設定）

> 若要開放註冊，請確認 Supabase Auth → Providers → Email 已啟用，並關閉 `Confirm email`。關閉後註冊不會寄送驗證信，且使用者可直接登入；這項 Auth 設定需在 Supabase Dashboard 修改，無法由前端 anon key 設定。

## 指令

```bash
npm run dev        # 開發伺服器
npm run build      # 生產建置
npm run preview    # 預覽建置結果
npm run typecheck  # vue-tsc 型別檢查
```

## 核心模型

```text
Orchard ─ Area ─ Tree（自由座標 position_x / position_y）

Task ─ TaskAssignment（ORCHARD / AREA / TREE + 週期）
         └ Execution Batch ─ Execution Items（實際落到每一棵 Tree）
```

- 任務指定 AREA 時，產生批次時解析「當下」區域內有效果樹（§62）
- 下次到期日 = 上次完成日 + 週期（§63）
- 一般刪除皆為軟刪除（active = false），歷史紀錄保留（§60）；管理模式可選擇永久刪除
- 執行歷史中的已結算批次可取消結算，恢復為執行中
- 區域地圖新增果樹時可一次建立多棵，預設以橫向單列排列
- 執行任務可切換地圖勾選，在區域總覽整區完成，或進入區域逐棵勾選果樹

## 主要頁面

| 路徑                          | 說明                               |
| ----------------------------- | ---------------------------------- |
| `/`                           | Dashboard 總覽                     |
| `/orchards`                   | 果園列表                           |
| `/orchards/:id/map`           | 果園地圖（Pan/Zoom/編輯/拖曳區域） |
| `/orchards/:id/areas/:areaId` | 區域地圖（果樹自由座標）           |
| `/trees`                      | 果樹管理                           |
| `/tree-types`                 | 果樹類型                           |
| `/task-categories`            | 任務類別                           |
| `/tasks`                      | 任務設定（含排程）                 |
| `/tasks/pending`              | 待執行任務                         |
| `/tasks/history`              | 任務歷史（`?tree=` 可篩單一果樹）  |
| `/settings`                   | 系統設定                           |
