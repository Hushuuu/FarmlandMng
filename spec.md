可以。按照你現在定下來的方向，我會把之前的 `Row` 完全拿掉，重新整理成一個更單純的模型：

```text
果園
 └─ 區域
     └─ 果樹

區域內的果樹全部採「自由座標」放置
```

任務則是：

```text
任務
 └─ 指定對象
     ├─ 果園
     ├─ 區域 → 等同區域內全部果樹
     └─ 果樹
```

其中我建議**實際任務執行時，永遠落到 Tree 層級**。例如「A 區施肥」在建立任務時只指定 A 區，但系統解析後就是 A 區目前所有果樹；這樣 Dashboard、歷史紀錄與未來逐樹追蹤會比較乾淨。

下面是我重新整理後的完整規格。

# 果園管理系統完整規格

## 1. 系統概述

### 1.1 系統名稱

果園管理系統（Orchard Management System）

### 1.2 系統目的

建立一套以「果園空間配置」與「農務任務管理」為核心的 Web 系統，用於管理：

* 多個果園
* 果園內多個區域
* 區域內果樹的實際配置位置
* 果樹類型
* 農務任務
* 任務週期
* 任務執行紀錄
* 任務逾期與即將到期狀態
* 果園與區域整體狀況

系統主要以手機瀏覽與操作為主，同時兼容桌面瀏覽器。

---

# 2. 系統技術架構

## 2.1 Frontend

| 項目               | 技術                      |
| ---------------- | ----------------------- |
| Framework        | Vue 3                   |
| Build Tool       | Vite                    |
| Language         | JavaScript              |
| UI Framework     | Naive UI / Vuetify（二選一） |
| Routing          | Vue Router              |
| State Management | Pinia                   |
| CSS              | 原生 CSS                  |
| Backend SDK      | Supabase JS             |
| Responsive       | Mobile First            |

不使用傳統後端 API Server。

系統架構：

```text
Browser
   │
   ├── Vue 3
   ├── Vue Router
   ├── Pinia
   └── UI Framework
          │
          ▼
      Supabase
          │
          ├── PostgreSQL
          ├── Auth
          ├── Storage
          └── RLS
```

---

# 3. 使用裝置

## 3.1 主要裝置

手機為主要使用情境。

需要支援：

* Android Chrome
* iPhone Safari
* iPad
* Desktop Chrome
* Desktop Edge

## 3.2 Mobile First

主要操作必須可以在手機上完成：

* 查看果園
* 查看區域
* 查看果樹
* 編輯果樹位置
* 新增 / 修改 / 刪除資料
* 查看待執行任務
* 執行任務
* 查看任務歷史

---

# 4. 系統資料階層

系統核心空間關係：

```text
Orchard
  │
  └── Area
        │
        ├── Tree
        ├── Tree
        ├── Tree
        └── Tree
```

不建立 Row 層級。

果樹直接隸屬於 Area。

---

# 5. 空間模型

## 5.1 設計原則

系統中的位置與 GPS 無關。

所有位置都是：

> 果園管理系統內部的 2D 相對座標。

不使用：

* GPS
* Latitude
* Longitude
* GIS
* Google Maps
* 衛星地圖

---

# 6. 果園地圖

## 6.1 地圖概念

果園地圖為一個可縮放、可移動的 2D Canvas / Map View。

使用者可以：

* Pan
* Zoom
* 點擊物件
* 選取物件
* 進入下一層
* 返回上一層
* 編輯位置
* 拖曳果樹

概念：

```text
果園地圖
│
├── Area A
│     ├── Tree
│     ├── Tree
│     └── Tree
│
├── Area B
│     ├── Tree
│     └── Tree
│
└── Area C
```

---

# 7. 地圖層級

## 7.1 Orchard Map

進入果園後顯示所有 Area。

```text
┌─────────────────────────┐
│  果園：一號果園           │
│                         │
│     ┌─────────┐         │
│     │ A 區     │         │
│     └─────────┘         │
│                         │
│                  ┌────┐ │
│                  │ B區 │ │
│                  └────┘ │
│                         │
└─────────────────────────┘
```

Area 是地圖上的主要物件。

---

# 8. Area Map

點擊 Area 後進入 Area 內部。

```text
果園 / A區

┌─────────────────────────┐
│                         │
│    🌳       🌳           │
│                         │
│          🌳             │
│                         │
│ 🌳             🌳       │
│                         │
└─────────────────────────┘
```

區域內所有 Tree 都可以自由放置。

---

# 9. 果樹位置

每棵 Tree 都具有：

```text
position_x
position_y
```

例如：

```text
Tree A
x = 120
y = 80

Tree B
x = 230
y = 160
```

不使用：

```text
Row
Sequence
Grid
```

作為主要位置依據。

---

# 10. 地圖操作

## 10.1 查看模式

預設為查看模式。

支援：

* 單指拖曳地圖
* 雙指縮放
* 點擊 Area
* 點擊 Tree
* 顯示物件資訊

---

## 10.2 編輯模式

點擊「編輯」後進入編輯模式。

支援：

* 拖曳 Area
* 拖曳 Tree
* 新增 Area
* 新增 Tree
* 刪除 Area
* 刪除 Tree
* 編輯物件資訊

手機上建議：

```text
查看模式
     ↓
[編輯]
     ↓
編輯模式
     ↓
[完成]
```

避免一般瀏覽時誤觸造成位置變更。

---

# 11. 地圖座標

建議使用虛擬座標系。

例如：

```text
Map Width  = 2000
Map Height = 1200
```

物件：

```text
Area A
x = 300
y = 200

Area B
x = 1000
y = 500
```

前端透過 CSS Transform / Absolute Positioning 顯示。

實際畫面大小不等於資料中的座標大小。

因此：

```text
手機
1920x1080

地圖
2000x1200
```

可以透過 Zoom 顯示完整地圖。

---

# 12. 地圖資料

## 12.1 Orchard

果園本身可保存：

```text
map_width
map_height
```

預設：

```text
2000 x 1200
```

之後可以調整。

---

# 13. Dashboard

Dashboard 是系統首頁。

主要目的：

> 快速知道目前所有果園與任務的狀況。

---

## 13.1 系統總覽

顯示：

```text
果園數
區域數
果樹數
今日待執行任務
即將到期任務
逾期任務
```

---

# 14. 果園總覽

每個果園顯示：

```text
果園名稱
區域數
果樹數
待執行任務
逾期任務
```

例如：

```text
一號果園

區域       8
果樹       1,280

今日任務   12
逾期        3
```

---

# 15. 區域狀況

Dashboard 可以進一步顯示：

```text
A區
果樹：120
待執行：5
逾期：1

B區
果樹：85
待執行：2
逾期：0
```

---

# 16. 任務警示

任務狀態：

```text
正常
即將到期
今日到期
逾期
已完成
停用
```

Dashboard 優先顯示：

```text
今日到期
逾期
即將到期
```

---

# 17. 基本資料

基本資料負責維護系統主檔。

```text
基本資料
├── 果樹類型
├── 任務類別
└── 其他主檔
```

---

# 18. 果樹類型

例如：

```text
芒果
芭樂
荔枝
龍眼
柚子
```

欄位：

```text
code
name
description
active
```

未來可以增加：

```text
default_icon
default_color
```

讓地圖上的不同果樹類型可以使用不同圖示。

---

# 19. 任務類別

例如：

```text
施肥
農藥
澆水
修剪
除草
採收
巡視
其他
```

欄位：

```text
code
name
description
active
```

---

# 20. 其他主檔

預留系統未來擴充。

第一版可以先不建立大量主檔。

可能包含：

```text
任務狀態
單位
操作類型
```

實際上如果資料很固定，可以直接使用 Enum，不需要全部建立 DB Table。

---

# 21. 任務管理

任務管理是系統第二個核心功能。

```text
任務管理
├── 任務設定
├── 待執行任務
├── 執行紀錄
└── 任務歷史
```

---

# 22. 任務設定

任務設定定義：

> 要做什麼事情、針對誰、多久做一次。

例如：

```text
任務：
A區施肥

類別：
施肥

對象：
A區

週期：
30天

啟用：
是
```

---

# 23. 任務基本資料

Task：

```text
id
code
name
category_id
description
active
created_at
updated_at
```

---

# 24. 任務指定對象

任務可以指定：

```text
ORCHARD
AREA
TREE
```

不再有 ROW。

---

# 25. Area 任務的特殊規則

如果：

```text
Target Type = AREA
Target = A區
```

則：

> 代表 A區目前所有 Tree 都需要執行此任務。

例如：

```text
A區

Tree 01
Tree 02
Tree 03
Tree 04
```

設定：

```text
施肥
Target = A區
```

系統會視為：

```text
Tree 01 → 施肥
Tree 02 → 施肥
Tree 03 → 施肥
Tree 04 → 施肥
```

---

# 26. Orchard 任務

如果指定：

```text
Target Type = ORCHARD
Target = 一號果園
```

代表：

> 一號果園目前所有 Area 底下所有 Tree 都需要執行。

---

# 27. Tree 任務

如果指定：

```text
Target Type = TREE
Target = Tree A
```

則只有這一棵樹需要執行。

---

# 28. 任務週期

任務週期為 Optional。

可以：

```text
無週期
```

也可以：

```text
每 N 天
每 N 週
每 N 個月
```

例如：

```text
每 7 天
每 30 天
每 3 個月
```

第一版不需要做複雜 Cron。

---

# 29. 任務排程

任務 Assignment 保存：

```text
task_id
target_type
target_id

start_date

recurrence_type
recurrence_value
recurrence_unit

active
```

例如：

```text
任務：施肥
目標：A區
開始：2026/08/01
週期：30天
```

---

# 30. 任務執行

任務執行紀錄：

```text
task_execution
```

每次執行產生一筆紀錄。

例如：

```text
任務：
施肥

目標：
A區

執行日期：
2026/08/01

執行狀態：
完成

備註：
正常施肥
```

---

# 31. 任務實際執行對象

雖然建立任務時可以指定：

```text
Area
```

但實際執行紀錄建議落到 Tree。

例如：

```text
A區
 ├─ Tree01 ✓
 ├─ Tree02 ✓
 ├─ Tree03 ✓
 └─ Tree04 ✕
```

這樣未來可以知道：

> 哪一棵樹實際完成、哪一棵沒有完成。

---

# 32. 任務執行流程

例如：

```text
設定：

A區
施肥
每30天
```

系統解析：

```text
A區
 ↓
取得目前所有 Tree
 ↓
Tree01
Tree02
Tree03
Tree04
 ↓
產生待執行項目
```

執行：

```text
Tree01 ✓
Tree02 ✓
Tree03 ✓
Tree04 ✓
```

全部完成後：

```text
本輪任務完成
```

---

# 33. 待執行任務

顯示目前需要處理的任務。

可依：

```text
今天
明天
即將到期
逾期
```

篩選。

例如：

```text
今日任務

施肥
A區
120棵
[開始執行]

噴藥
B區
85棵
[開始執行]
```

---

# 34. 任務執行 UI

手機優先。

建議使用：

```text
Bottom Sheet
Drawer
Dialog
```

而不是開新頁面。

例如：

```text
A區施肥

進度
████████░░ 80%

96 / 120

[全部完成]

Tree 01 ✓
Tree 02 ✓
Tree 03 ✓
Tree 04 ○
...
```

---

# 35. 執行狀態

Tree Task Execution：

```text
PENDING
COMPLETED
SKIPPED
FAILED
```

其中：

```text
PENDING = 待執行
COMPLETED = 完成
SKIPPED = 略過
FAILED = 執行失敗
```

---

# 36. 下次週期

任務完成後系統計算：

```text
last_execution
next_execution
```

例如：

```text
本次執行：
2026/08/20

週期：
30天

下次：
2026/09/19
```

---

# 37. 任務歷史

可以查看：

```text
任務
執行日期
執行對象
執行結果
操作者
備註
```

例如：

```text
施肥
2026/08/20
A區
120 / 120
完成

施肥
2026/07/21
A區
118 / 120
部分完成
```

---

# 38. Supabase Database Schema

## 38.1 orchards

```text
id              uuid PK
code            varchar
name            varchar
description     text
map_width       numeric
map_height      numeric
active          boolean
created_at      timestamptz
updated_at      timestamptz
```

---

# 39. areas

```text
id              uuid PK
orchard_id      uuid FK orchards.id

code            varchar
name            varchar
description     text

position_x      numeric
position_y      numeric

width           numeric
height          numeric
rotation        numeric

active          boolean

created_at      timestamptz
updated_at      timestamptz
```

---

# 40. trees

```text
id              uuid PK
area_id         uuid FK areas.id
tree_type_id    uuid FK tree_types.id

code            varchar
name            varchar

position_x      numeric
position_y      numeric

status          varchar

planted_at      date
note            text

active          boolean

created_at      timestamptz
updated_at      timestamptz
```

---

# 41. tree_types

```text
id              uuid PK
code            varchar
name            varchar
description     text
active          boolean
created_at      timestamptz
updated_at      timestamptz
```

---

# 42. task_categories

```text
id              uuid PK
code            varchar
name            varchar
description     text
active          boolean
created_at      timestamptz
updated_at      timestamptz
```

---

# 43. tasks

```text
id              uuid PK
code            varchar
name            varchar

category_id     uuid FK task_categories.id

description     text

active          boolean

created_at      timestamptz
updated_at      timestamptz
```

---

# 44. task_assignments

```text
id                  uuid PK

task_id             uuid FK tasks.id

target_type         varchar
target_id           uuid

start_date          date

recurrence_type     varchar
recurrence_value    integer
recurrence_unit     varchar

active              boolean

note                text

created_at          timestamptz
updated_at          timestamptz
```

Target：

```text
ORCHARD
AREA
TREE
```

---

# 45. task_execution_batches

建議增加一層 Batch。

因為：

> 一次「A區施肥」其實是一個任務批次，下面有很多 Tree。

例如：

```text
A區施肥
2026/08/22
```

就是一個 Batch。

Schema：

```text
id                  uuid PK

task_assignment_id  uuid FK task_assignments.id

scheduled_date      date
started_at          timestamptz
completed_at        timestamptz

status              varchar

note                text

created_at          timestamptz
updated_at          timestamptz
```

---

# 46. task_execution_items

實際到 Tree 層級。

```text
id                  uuid PK

execution_batch_id  uuid FK task_execution_batches.id

tree_id             uuid FK trees.id

status              varchar

executed_at         timestamptz

operator_id         uuid

note                text

created_at          timestamptz
updated_at          timestamptz
```

這樣資料關係就是：

```text
Task
 │
 └── Assignment
       │
       └── Execution Batch
              │
              ├── Tree 01
              ├── Tree 02
              ├── Tree 03
              └── Tree 04
```

這個結構我認為比直接把所有東西塞在 `task_executions` 好很多。

---

# 47. 使用者 / 操作者

使用 Supabase Auth。

可以建立：

```text
profiles
```

```text
id              uuid PK
display_name    varchar
active          boolean
created_at      timestamptz
updated_at      timestamptz
```

`id` 對應：

```text
auth.users.id
```

未來可以支援：

```text
管理員
一般使用者
```

第一版可以只有單一權限。

---

# 48. System Settings

系統設定保存：

```text
system_settings
```

例如：

```text
id
key
value
description
updated_at
```

可能設定：

```text
default_map_width
default_map_height
task_due_warning_days
```

例如：

```text
task_due_warning_days = 3
```

代表任務剩 3 天時開始顯示：

```text
即將到期
```

---

# 49. Dashboard 資料來源

Dashboard 不需要額外保存大量統計數字。

由 PostgreSQL Query / View 計算：

```text
果園數
Area 數
Tree 數
今日任務
逾期任務
即將到期任務
```

必要時建立 PostgreSQL View。

避免：

```text
orchard.tree_count
area.tree_count
```

這種容易因 CRUD 而不同步的快取欄位。

---

# 50. Supabase RLS

所有資料表預設啟用 RLS。

基本原則：

```text
登入使用者
    ↓
可以讀取系統資料

登入使用者
    ↓
依權限新增 / 修改 / 刪除
```

第一版可以簡化為：

```text
authenticated
```

使用者全部具有系統操作權限。

未來再增加 Role。

---

# 51. 前端頁面結構

```text
/
└── dashboard

/orchards
└── orchard list

/orchards/:orchardId/map
└── orchard map

/orchards/:orchardId/areas/:areaId
└── area map

/trees
└── tree management

/tree-types
└── tree type management

/task-categories
└── task category management

/tasks
└── task settings

/tasks/pending
└── pending tasks

/tasks/executions
└── execution records

/tasks/history
└── task history

/settings
└── system settings
```

---

# 52. Vue Component 結構

```text
src/
├── components/
│   ├── common/
│   ├── orchard/
│   │   ├── OrchardMap.vue
│   │   ├── AreaMarker.vue
│   │   ├── TreeMarker.vue
│   │   ├── MapToolbar.vue
│   │   └── MapControls.vue
│   │
│   └── task/
│       ├── TaskCard.vue
│       ├── TaskExecution.vue
│       └── TaskStatus.vue
│
├── views/
│   ├── DashboardView.vue
│   ├── OrchardMapView.vue
│   ├── AreaMapView.vue
│   ├── TreeView.vue
│   ├── TaskView.vue
│   └── SettingsView.vue
│
├── stores/
│   ├── orchard.ts
│   ├── area.ts
│   ├── tree.ts
│   └── task.ts
│
├── services/
│   ├── orchardService.ts
│   ├── treeService.ts
│   └── taskService.ts
│
└── router/
    └── index.ts
```

---

# 53. UI Layout

Desktop：

```text
┌──────────────┬─────────────────────────────┐
│              │                             │
│ Sidebar      │ Main Content                │
│              │                             │
│ Dashboard    │                             │
│ 果園管理      │                             │
│ 基本資料      │                             │
│ 任務管理      │                             │
│ 設定         │                             │
│              │                             │
└──────────────┴─────────────────────────────┘
```

Mobile：

```text
┌──────────────────────┐
│ Header               │
├──────────────────────┤
│                      │
│ Main Content         │
│                      │
│                      │
├──────────────────────┤
│ Dashboard 果園 任務  │
└──────────────────────┘
```

手機不使用固定 Sidebar。

改成：

* Bottom Navigation
* Drawer
* Bottom Sheet

---

# 54. 果園地圖 UI

主要工具列：

```text
[←] [果園名稱]          [編輯]

                     [＋]
                     [－]
                     [定位]
```

編輯模式：

```text
[新增區域]
[新增果樹]
[刪除]
[完成]
```

---

# 55. Area 操作

點擊 Area：

```text
A區

果樹
120

今日任務
5

逾期
1

[進入區域]
```

進入後：

```text
果園 / A區
```

顯示全部 Tree。

---

# 56. Tree 操作

點擊 Tree：

```text
Tree A001

類型：
芒果

狀態：
正常

種植日期：
2024/03/01

任務：
2 項待執行

[查看]
```

可以直接從 Tree 詳情進入：

```text
[任務]
```

查看該 Tree 的任務。

---

# 57. 果樹位置編輯

拖曳 Tree：

```text
pointerdown
    ↓
pointermove
    ↓
即時更新 UI position
    ↓
pointerup
    ↓
儲存 position_x / position_y
```

建議不要每一個 pointermove 都寫 Supabase。

應該：

```text
UI 即時移動
      ↓
拖曳結束
      ↓
一次 UPDATE
```

---

# 58. 新增果樹

在 Area Map：

```text
[＋果樹]
```

新增：

```text
果樹類型
名稱 / 編號
備註
```

建立後：

```text
position_x
position_y
```

預設放在目前地圖中心附近。

之後使用者拖曳到正確位置。

---

# 59. Area 新增

在 Orchard Map：

```text
[＋區域]
```

輸入：

```text
區域編號
區域名稱
說明
```

建立後自動放到地圖預設位置。

使用者再拖曳調整。

---

# 60. 刪除策略

果園、Area、Tree 不建議直接 Hard Delete。

建議使用：

```text
active = false
```

做軟刪除。

原因：

> 任務歷史資料可能仍然引用已刪除的 Tree。

例如 Tree 已經移除，但過去的：

```text
2026/07/01
施肥
Tree A
完成
```

歷史紀錄仍然必須存在。

---

# 61. 任務與歷史資料的核心原則

任務設定是「現在的規則」。

任務執行紀錄是「過去發生的事」。

因此：

```text
Task
```

可以修改。

但：

```text
Task Execution
Task Execution Item
```

歷史資料不應該因為 Task 設定修改而被覆蓋。

---

# 62. 任務與 Area / Tree 的關係

建立任務時：

```text
施肥
Target = A區
```

不是把：

```text
A區所有 Tree UUID
```

永久複製到 Assignment。

而是在產生 Execution Batch 時：

```text
取得當下 A區的 Active Trees
```

再建立：

```text
task_execution_items
```

這樣如果：

```text
8/1
A區 = 100棵
```

到：

```text
9/1
A區 = 110棵
```

9/1 的任務就會針對新的 110 棵樹。

這個行為非常重要。

---

# 63. 任務週期計算

第一版建議採：

> 以實際完成日期計算下一次執行日期。

例如：

```text
週期：30天

原本預計：
8/1

實際完成：
8/3

下一次：
9/2
```

這比較符合農務實際操作。

如果未來需要固定排程，再增加：

```text
schedule_mode
```

即可。

---

# 65. MVP 開發順序

## Phase 1：基礎架構

```text
Vue 3
Vite
TypeScript
UI Framework
Pinia
Vue Router
Supabase
Auth
RLS
```

---

## Phase 2：基本資料

```text
果園
Area
Tree
Tree Type
Task Category
```

完成基本 CRUD。

---

## Phase 3：果園地圖

先完成：

```text
Orchard Map
Area Map
```

支援：

```text
Pan
Zoom
點擊
進入
返回
```

---

## Phase 4：自由位置編輯

完成：

```text
Area Drag
Tree Drag
新增 Area
新增 Tree
刪除 / 停用
```

這一階段完成後，系統就會開始具有「遊戲地圖」的感覺。

---

## Phase 5：任務設定

完成：

```text
Task
Task Assignment
Target

ORCHARD
AREA
TREE
```

以及：

```text
週期
啟用 / 停用
開始日期
```

---

## Phase 6：任務執行

完成：

```text
Execution Batch
Execution Item
```

手機操作：

```text
開始任務
 ↓
Tree 清單
 ↓
逐棵完成
 ↓
完成本輪任務
```

---

## Phase 7：Dashboard

加入：

```text
果園統計
區域統計
果樹統計
今日任務
即將到期
逾期
```

---

## Phase 8：歷史

完成：

```text
執行紀錄
任務歷史
Tree 歷史
```

---

# 66. 最終系統核心模型

最終整個系統可以濃縮成：

```text
                    ┌─────────────┐
                    │   Orchard   │
                    └──────┬──────┘
                           │
                     ┌─────▼─────┐
                     │   Area    │
                     └─────┬─────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
             Tree         Tree         Tree
              │
              │
              └──────────────┐
                             │
                          Task Target
                             │
                    ┌────────┴────────┐
                    │                 │
                  Task             Assignment
                                      │
                                      ▼
                                Execution Batch
                                      │
                         ┌────────────┼────────────┐
                         │            │            │
                       Tree         Tree         Tree
                         │            │            │
                         └────────────┴────────────┘
                                      │
                              Execution Items
```

---

# 67. 最終 Menu

```text
Dashboard

果園管理
├── 果園地圖
├── 區域
└── 果樹

基本資料
├── 果樹類型
├── 任務類別
└── 其他主檔

任務管理
├── 任務設定
├── 待執行任務
├── 執行紀錄
└── 任務歷史

設定
└── 系統設定
```

---

# 68. 第一版核心使用流程

使用者第一次建立系統：

```text
建立果園
   ↓
建立區域
   ↓
進入區域
   ↓
新增果樹
   ↓
拖曳果樹到實際位置
   ↓
完成果園配置
```

接著：

```text
建立任務
   ↓
選擇「施肥」
   ↓
選擇「A區」
   ↓
設定每30天
   ↓
儲存
```

到了執行日期：

```text
Dashboard
   ↓
今日任務
   ↓
A區施肥
   ↓
開始執行
   ↓
逐棵 Tree 確認
   ↓
完成
   ↓
建立 Execution Batch
   ↓
建立 Execution Items
   ↓
計算下一次執行日期
```

最後 Dashboard 顯示：

```text
A區
120 棵樹

今日任務
0

即將到期
2

逾期
0
```

這樣第一版就形成完整閉環：

**「建立果園 → 配置空間 → 管理果樹 → 設定農務 → 執行農務 → 留下歷史 → Dashboard 追蹤狀態」**
