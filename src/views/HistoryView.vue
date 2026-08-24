<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NEmpty, NSelect, NSpin, NTag } from 'naive-ui'
import { areaService, orchardService } from '../services/orchardService'
import type { Area, BatchSummary, ItemStatus, Orchard } from '../types/database'
import { getBatchWithItems, listBatchSummaries } from '../services/taskService'
import { BATCH_STATUS_META, ITEM_STATUS_META } from '../constants/status'
import { formatDateWithWeekday } from '../utils/date'

interface DetailItem {
  id: string
  status: ItemStatus
  label: string
}

const route = useRoute()
const treeId = computed(() => (route.query.tree as string) ?? null)

const loading = ref(true)
const treeLabel = ref('')

const batches = ref<BatchSummary[]>([])
const orchards = ref<Orchard[]>([])
const areas = ref<Area[]>([])
const details = reactive(new Map<string, DetailItem[]>())

// ------------------------------------------------------------
// 篩選：果園 → 區域 → 任務（§37 整併執行紀錄與任務歷史）
// ------------------------------------------------------------
const orchardFilter = ref<string>('ALL')
const areaFilter = ref<string>('ALL')
const taskFilter = ref<string>('ALL')

const orchardOptions = computed(() => [
  { label: '全部果園', value: 'ALL' },
  ...orchards.value.map((o) => ({ label: o.name, value: o.id })),
])

const areaOptions = computed(() => {
  const list =
    orchardFilter.value === 'ALL'
      ? areas.value
      : areas.value.filter((a) => a.orchard_id === orchardFilter.value)
  return [{ label: '全部區域', value: 'ALL' }, ...list.map((a) => ({ label: a.name, value: a.id }))]
})

const taskOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const b of batches.value) {
    if (!seen.has(b.taskId)) seen.set(b.taskId, b.taskName)
  }
  return [{ label: '全部任務', value: 'ALL' }, ...[...seen].map(([id, name]) => ({ label: name, value: id }))]
})

function pickOrchard() {
  areaFilter.value = 'ALL'
}

const filtered = computed(() =>
  batches.value.filter(
    (b) =>
      (orchardFilter.value === 'ALL' || b.orchardId === orchardFilter.value) &&
      (areaFilter.value === 'ALL' || b.areaId === areaFilter.value) &&
      (taskFilter.value === 'ALL' || b.taskId === taskFilter.value),
  ),
)

function statusMeta(s: BatchSummary['status']) {
  return BATCH_STATUS_META[s]
}

/** 展開時才載入逐樹明細 */
async function ensureDetail(keys: (string | number)[]) {
  if (treeId.value) return
  for (const k of keys) {
    const id = String(k)
    if (details.has(id)) continue
    try {
      const { items } = await getBatchWithItems(id)
      details.set(
        id,
        items.map((i) => ({
          id: i.id,
          status: i.status,
          label: i.tree ? (i.tree.name ? `${i.tree.name}（${i.tree.code}）` : i.tree.code) : '?',
        })),
      )
    } catch {
      details.set(id, [])
    }
  }
}

async function load() {
  loading.value = true
  details.clear()
  try {
    if (treeId.value) {
      // 單一果樹歷史模式（從果樹資訊卡 / 果樹管理進入）
      const summaries = await listBatchSummaries()
      const all = await getBatchItemsForTree(treeId.value, summaries)
      batches.value = all.batches
      for (const [k, v] of all.detailEntries) details.set(k, v)
      treeLabel.value = all.label
    } else {
      const [summaries, os, as] = await Promise.all([
        listBatchSummaries(),
        orchardService.list(),
        areaService.listAll(),
      ])
      batches.value = summaries
      orchards.value = os
      areas.value = as
    }
  } finally {
    loading.value = false
  }
}

/** 單樹模式：以該樹的 items 反查批次，組出與一般模式相同的卡片結構 */
async function getBatchItemsForTree(tid: string, summaries: BatchSummary[]) {
  const { supabase } = await import('../lib/supabase')
  const [{ data: tree }, { data: items }] = await Promise.all([
    supabase.from('trees').select('code, name').eq('id', tid).maybeSingle(),
    supabase.from('task_execution_items').select('id, status, execution_batch_id').eq('tree_id', tid),
  ])
  const t = (tree ?? null) as { code: string; name: string | null } | null
  const rows = (items ?? []) as { id: string; status: ItemStatus; execution_batch_id: string }[]
  const byBatch = new Map<string, DetailItem[]>()
  for (const r of rows) {
    const list = byBatch.get(r.execution_batch_id)
    const item: DetailItem = {
      id: r.id,
      status: r.status,
      label: t?.name ? `${t.name}（${t.code}）` : (t?.code ?? '?'),
    }
    if (list) list.push(item)
    else byBatch.set(r.execution_batch_id, [item])
  }
  const ids = new Set(byBatch.keys())
  const list = summaries.filter((b) => ids.has(b.id))
  return {
    label: t?.name ? `${t.name}（${t.code}）` : (t?.code ?? '果樹'),
    batches: list,
    detailEntries: [...byBatch.entries()] as [string, DetailItem[]][],
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h1 class="page-title">{{ treeId ? `果樹歷史：${treeLabel}` : '執行歷史' }}</h1>

    <!-- 篩選：果園 / 區域 / 任務 -->
    <div v-if="!treeId" class="filters">
      <n-select v-model:value="orchardFilter" :options="orchardOptions" size="small" @update:value="pickOrchard" />
      <n-select v-model:value="areaFilter" :options="areaOptions" size="small" />
      <n-select v-model:value="taskFilter" :options="taskOptions" size="small" />
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!filtered.length && !loading" description="沒有符合條件的紀錄" style="padding: 40px 0" />

      <div class="list">
        <details v-for="b in filtered" :key="b.id" class="batch-card" @toggle="(e: Event) => { if ((e.target as HTMLDetailsElement).open) ensureDetail([b.id]) }">
          <summary class="summary">
            <div class="s-main">
              <div class="title">
                {{ b.taskName }}
                <span v-if="b.categoryName" class="cat">{{ b.categoryName }}</span>
                <n-tag v-if="b.status === 'IN_PROGRESS'" size="tiny" type="info" round>執行中</n-tag>
              </div>
              <div class="path muted">{{ b.targetLabel }}</div>
              <div class="muted">
                {{ formatDateWithWeekday(b.scheduled_date) }} ·
                {{ b.completedItems }} / {{ b.totalItems }}
                {{ b.totalItems === 0 ? '' : b.completedItems === b.totalItems ? '完成' : b.completedItems === 0 ? '未完成' : '部分完成' }}
              </div>
            </div>
            <n-tag size="small" :type="statusMeta(b.status).type" round>{{ statusMeta(b.status).label }}</n-tag>
          </summary>

          <div class="detail-list">
            <div v-for="it in details.get(b.id) ?? []" :key="it.id" class="item-row">
              <span class="mark" :class="it.status.toLowerCase()">
                {{ it.status === 'COMPLETED' ? '✓' : it.status === 'SKIPPED' ? '↷' : it.status === 'FAILED' ? '✕' : '○' }}
              </span>
              <span class="tname">{{ it.label }}</span>
              <n-tag size="tiny" :type="ITEM_STATUS_META[it.status].type">{{ ITEM_STATUS_META[it.status].label }}</n-tag>
            </div>
            <div v-if="!details.get(b.id)?.length" class="muted" style="padding: 6px 0">無明細資料</div>
          </div>
        </details>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

@media (max-width: 560px) {
  .filters {
    grid-template-columns: 1fr;
  }
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-card {
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
  padding: 10px 14px;
}

.summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}

.summary::-webkit-details-marker {
  display: none;
}

.s-main {
  min-width: 0;
}

.title {
  font-size: 14.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cat {
  font-size: 11px;
  color: var(--primary);
  background: rgba(24, 160, 88, 0.1);
  padding: 1px 6px;
  border-radius: 6px;
  font-weight: 600;
}

.path {
  font-size: 13px;
  font-weight: 600;
  margin-top: 2px;
}

.detail-list {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.mark {
  width: 16px;
  text-align: center;
  font-weight: 700;
}

.mark.completed {
  color: #18a058;
}

.mark.skipped {
  color: #f0a020;
}

.mark.failed {
  color: #d03050;
}

.mark.pending {
  color: #b9bec4;
}

.tname {
  flex: 1;
  min-width: 0;
}
</style>
