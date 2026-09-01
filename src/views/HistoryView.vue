<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NEmpty, NSelect, NSpin, NTag, useDialog, useMessage } from 'naive-ui'
import { areaService, orchardService } from '../services/orchardService'
import type { Area, BatchSummary, ItemStatus, Orchard } from '../types/database'
import {
  cancelSettlement,
  getBatchWithItems,
  hardDeleteBatch,
  listBatchSummaries,
} from '../services/taskService'
import { BATCH_STATUS_META, ITEM_STATUS_META } from '../constants/status'
import { formatDateWithWeekday, toDateStr } from '../utils/date'
import { useManagementStore } from '../stores/management'
import { useTaskStore } from '../stores/task'

interface DetailItem {
  id: string
  status: ItemStatus
  label: string
}

interface SettlementGroup {
  key: string
  location: string
  taskName: string
  categoryName: string | null
  settledCount: number
  lastDate: string
}

const route = useRoute()
const treeId = computed(() => (route.query.tree as string) ?? null)
const message = useMessage()
const dialog = useDialog()
const management = useManagementStore()
const taskStore = useTaskStore()

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
const groupBy = ref<'ORCHARD' | 'AREA'>('ORCHARD')

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

function settlementDate(batch: BatchSummary): string {
  if (!batch.completed_at) return batch.scheduled_date
  const date = new Date(batch.completed_at)
  return Number.isNaN(date.getTime()) ? batch.scheduled_date : toDateStr(date)
}

const filtered = computed(() =>
  batches.value.filter(
    (b) =>
      (orchardFilter.value === 'ALL' || b.orchardId === orchardFilter.value) &&
      (areaFilter.value === 'ALL' || b.areaId === areaFilter.value) &&
      (taskFilter.value === 'ALL' || b.taskId === taskFilter.value),
  ),
)

const settlementGroups = computed<SettlementGroup[]>(() => {
  const groups = new Map<string, SettlementGroup>()
  for (const batch of filtered.value) {
    if (batch.status !== 'COMPLETED') continue
    const settledDate = settlementDate(batch)
    const parts = batch.targetLabel.split(' / ').filter(Boolean)
    const orchardLabel = parts[0] ?? '未指定果園'
    const areaLabel = parts[1] ?? '果園層級'
    const location =
      groupBy.value === 'ORCHARD'
        ? orchardLabel
        : `${orchardLabel} / ${batch.areaId ? areaLabel : '果園層級'}`
    const key =
      groupBy.value === 'ORCHARD'
        ? `${batch.orchardId ?? orchardLabel}:${batch.taskId || batch.taskName}`
        : `${batch.orchardId ?? orchardLabel}:${batch.areaId ?? 'ORCHARD'}:${batch.taskId || batch.taskName}`
    const current = groups.get(key)
    if (current) {
      current.settledCount++
      if (settledDate > current.lastDate) current.lastDate = settledDate
    } else {
      groups.set(key, {
        key,
        location,
        taskName: batch.taskName,
        categoryName: batch.categoryName,
        settledCount: 1,
        lastDate: settledDate,
      })
    }
  }
  return [...groups.values()].sort((a, b) => {
    const countDiff = b.settledCount - a.settledCount
    return countDiff !== 0 ? countDiff : b.lastDate.localeCompare(a.lastDate)
  })
})

function statusMeta(s: BatchSummary['status']) {
  return BATCH_STATUS_META[s]
}

function formatCost(value: number): string {
  return value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

function confirmCancelSettlement(batch: BatchSummary) {
  dialog.warning({
    title: '取消結算',
    content: '將保留目前逐樹進度，並把本批次恢復為「執行中」，之後可以繼續執行。確定取消結算？',
    positiveText: '取消結算',
    negativeText: '返回',
    onPositiveClick: async () => {
      try {
        await cancelSettlement(batch.id)
        await load()
        message.success('已取消結算，可從待執行任務繼續')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '取消結算失敗')
      }
    },
  })
}

function confirmHardDeleteBatch(batch: BatchSummary) {
  dialog.error({
    title: '永久刪除執行紀錄',
    content: `將永久刪除「${batch.taskName}」在 ${batch.scheduled_date} 的整批執行紀錄與逐樹明細，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await hardDeleteBatch(batch.id)
        if (taskStore.activeBatch?.id === batch.id) taskStore.clearExecution()
        await load()
        message.success('執行紀錄已永久刪除')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
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
      <section v-if="!treeId" class="settlement-panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">任務結算次數</div>
            <div class="muted">依果園或區域統計已完成的執行批次</div>
          </div>
          <div class="group-toggle">
            <n-button size="tiny" :type="groupBy === 'ORCHARD' ? 'primary' : 'default'" @click="groupBy = 'ORCHARD'">
              依果園
            </n-button>
            <n-button size="tiny" :type="groupBy === 'AREA' ? 'primary' : 'default'" @click="groupBy = 'AREA'">
              依區域
            </n-button>
          </div>
        </div>
        <div v-if="settlementGroups.length" class="settlement-list">
          <div v-for="group in settlementGroups" :key="group.key" class="settlement-row">
            <div class="settlement-location">{{ group.location }}</div>
            <div class="settlement-task">
              {{ group.taskName }}
              <span v-if="group.categoryName" class="cat">{{ group.categoryName }}</span>
            </div>
            <div class="settlement-count">{{ group.settledCount }} 次</div>
            <div class="muted">最近 {{ formatDateWithWeekday(group.lastDate) }}</div>
          </div>
        </div>
        <div v-else class="muted settlement-empty">目前篩選條件沒有已結算的任務</div>
      </section>

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
              <div v-if="b.assignmentNote" class="history-note muted">備註：{{ b.assignmentNote }}</div>
              <div v-if="b.note || b.cost != null" class="history-note muted">
                <span v-if="b.note">執行備註：{{ b.note }}</span>
                <span v-if="b.cost != null">成本 ${{ formatCost(b.cost) }}</span>
              </div>
              <div class="muted">
                {{ formatDateWithWeekday(b.scheduled_date) }} ·
                {{ b.completedItems }} / {{ b.totalItems }}
                {{ b.totalItems === 0 ? '' : b.completedItems === b.totalItems ? '完成' : b.completedItems === 0 ? '未完成' : '部分完成' }}
              </div>
            </div>
            <div class="summary-actions">
              <n-tag size="small" :type="statusMeta(b.status).type" round>{{ statusMeta(b.status).label }}</n-tag>
              <n-button
                v-if="b.status === 'COMPLETED'"
                size="tiny"
                quaternary
                type="warning"
                @click.stop="confirmCancelSettlement(b)"
              >
                取消結算
              </n-button>
              <n-button
                v-if="management.unlocked"
                size="tiny"
                quaternary
                type="error"
                @click.stop="confirmHardDeleteBatch(b)"
              >
                永久刪除
              </n-button>
            </div>
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

.settlement-panel {
  margin-bottom: 14px;
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
  padding: 12px 14px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
}

.group-toggle {
  display: flex;
  gap: 4px;
}

.settlement-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settlement-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) minmax(120px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #f0f1f3;
  padding-top: 7px;
  font-size: 13px;
}

.settlement-location,
.settlement-task {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settlement-location {
  font-weight: 600;
}

.settlement-count {
  color: var(--primary);
  font-weight: 700;
  white-space: nowrap;
}

.settlement-empty {
  padding: 10px 0 2px;
  text-align: center;
}

@media (max-width: 560px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .panel-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .settlement-row {
    grid-template-columns: 1fr auto;
  }

  .settlement-row .muted {
    grid-column: 1 / -1;
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

.summary-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.history-note {
  margin-top: 2px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
