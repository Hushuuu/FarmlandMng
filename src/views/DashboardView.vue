<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpin,
  useDialog,
  useMessage,
} from 'naive-ui'
import { statsService } from '../services/statsService'
import type { AreaStats, OrchardStats } from '../services/statsService'
import { cancelSettlement, getPendingTasks, listBatchSummaries, updateBatchDetails } from '../services/taskService'
import type { BatchSummary, PendingTaskInfo } from '../types/database'
import TaskCard from '../components/task/TaskCard.vue'
import OrchardDetailDrawer from '../components/orchard/OrchardDetailDrawer.vue'
import { useTaskStore } from '../stores/task'
import { formatDateWithWeekday, todayStr, toDateStr } from '../utils/date'

const router = useRouter()
const taskStore = useTaskStore()
const dialog = useDialog()
const message = useMessage()

const loading = ref(true)
const counts = ref({ orchards: 0, areas: 0, trees: 0 })
const orchardStats = ref<OrchardStats[]>([])
const areaStats = ref<AreaStats[]>([])
const pending = ref<PendingTaskInfo[]>([])
const history = ref<BatchSummary[]>([])
const showOrchardDetail = ref(false)
const selectedOrchard = ref<OrchardStats | null>(null)
const orchardFilter = ref('ALL')

const orchardOptions = computed(() => [
  { label: '全部果園', value: 'ALL' },
  ...orchardStats.value.map((stats) => ({ label: stats.orchard.name, value: stats.orchard.id })),
])

const filteredPending = computed(() =>
  orchardFilter.value === 'ALL'
    ? pending.value
    : pending.value.filter((task) => task.orchardId === orchardFilter.value),
)

const filteredHistory = computed(() =>
  orchardFilter.value === 'ALL'
    ? history.value
    : history.value.filter((batch) => batch.orchardId === orchardFilter.value),
)

const todayTasks = computed(() => filteredPending.value.filter((p) => p.dueStatus === 'DUE_TODAY'))
const overdueTasks = computed(() => filteredPending.value.filter((p) => p.dueStatus === 'OVERDUE'))
const upcomingTasks = computed(() => filteredPending.value.filter((p) => p.dueStatus === 'UPCOMING'))

const linkedOrchards = computed(() =>
  orchardFilter.value === 'ALL'
    ? orchardStats.value
    : orchardStats.value.filter((stats) => stats.orchard.id === orchardFilter.value),
)

function settlementDate(batch: BatchSummary): string {
  if (!batch.completed_at) return batch.scheduled_date
  const date = new Date(batch.completed_at)
  return Number.isNaN(date.getTime()) ? batch.scheduled_date : toDateStr(date)
}

const todaySettledTasks = computed(() =>
  filteredHistory.value.filter(
    (batch) => batch.status === 'COMPLETED' && settlementDate(batch) === todayStr(),
  ),
)

function openOrchardDetail(stats: OrchardStats) {
  selectedOrchard.value = stats
  showOrchardDetail.value = true
}

function openOrchardMap(stats: OrchardStats) {
  router.push(`/orchards/${stats.orchard.id}/map`)
}

function openSelectedOrchardMap() {
  if (!selectedOrchard.value) return
  showOrchardDetail.value = false
  router.push(`/orchards/${selectedOrchard.value.orchard.id}/map`)
}

async function refreshDetail() {
  try {
    const [pt, hs] = await Promise.all([getPendingTasks(), listBatchSummaries()])
    pending.value = pt
    history.value = hs
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入任務狀況失敗')
  }
}

async function execute(p: PendingTaskInfo) {
  try {
    await taskStore.beginExecution(p.assignment.id)
    await refreshDetail()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '無法開始執行')
  }
}

const showBatchEditor = ref(false)
const editingBatch = ref<BatchSummary | null>(null)
const batchNote = ref('')
const batchCost = ref<number | null>(null)
const savingBatchDetails = ref(false)

function formatCost(value: number): string {
  return value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

function completionLabel(batch: BatchSummary): string {
  if (batch.totalItems === 0) return ''
  if (batch.completedItems === batch.totalItems) return '完成'
  if (batch.completedItems === 0) return '未完成'
  return '部分完成'
}

function openBatchEditor(batch: BatchSummary) {
  editingBatch.value = batch
  batchNote.value = batch.note ?? ''
  batchCost.value = batch.cost
  showBatchEditor.value = true
}

async function saveBatchDetails() {
  const batch = editingBatch.value
  if (!batch) return

  savingBatchDetails.value = true
  try {
    await updateBatchDetails(batch.id, batchNote.value, batchCost.value)
    await refreshDetail()
    showBatchEditor.value = false
    editingBatch.value = null
    message.success('執行備註與成本已更新')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新執行資訊失敗')
  } finally {
    savingBatchDetails.value = false
  }
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
        await refreshDetail()
        message.success('已取消結算，可從待執行任務繼續')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '取消結算失敗')
      }
    },
  })
}

watch(
  () => taskStore.executionSheetOpen,
  (isOpen, wasOpen) => {
    if (wasOpen && !isOpen) void refreshDetail()
  },
)

onMounted(async () => {
  try {
    const [c, os, ars, pt, hs] = await Promise.all([
      statsService.counts(),
      statsService.orchardStats(),
      statsService.areaStats(),
      getPendingTasks(),
      listBatchSummaries(),
    ])
    counts.value = c
    orchardStats.value = os
    areaStats.value = ars
    pending.value = pt
    history.value = hs
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <n-spin :show="loading">
      <h1 class="page-title">總覽</h1>

      <section class="dashboard-tools">
        <div class="filter-row">
          <div>
            <div class="panel-title">任務果園篩選</div>
            <div class="muted">篩選待執行與今日結算任務</div>
          </div>
          <n-select v-model:value="orchardFilter" :options="orchardOptions" size="small" filterable />
        </div>
        <div v-if="linkedOrchards.length" class="orchard-links">
          <div class="muted links-label">果園入口</div>
          <div v-for="stats in linkedOrchards" :key="stats.orchard.id" class="orchard-link-row">
            <span class="orchard-link-name">{{ stats.orchard.name }}</span>
            <div class="orchard-link-actions">
              <n-button size="tiny" secondary @click="openOrchardDetail(stats)">查看任務</n-button>
              <n-button size="tiny" secondary type="primary" @click="openOrchardMap(stats)">地圖</n-button>
            </div>
          </div>
        </div>
      </section>

      <!-- 系統總覽（§13.1） -->
      <n-grid cols="2 s:3 m:6" x-gap="8" y-gap="8" responsive="screen">
        <n-gi><n-card size="small"><div class="stat-label">果園</div><div class="stat-value">{{ counts.orchards }}</div></n-card></n-gi>
        <n-gi><n-card size="small"><div class="stat-label">區域</div><div class="stat-value">{{ counts.areas }}</div></n-card></n-gi>
        <n-gi><n-card size="small"><div class="stat-label">果樹</div><div class="stat-value">{{ counts.trees }}</div></n-card></n-gi>
        <n-gi><n-card size="small"><div class="stat-label warn">今日任務</div><div class="stat-value warn">{{ todayTasks.length }}</div></n-card></n-gi>
        <n-gi><n-card size="small"><div class="stat-label info">即將到來</div><div class="stat-value info">{{ upcomingTasks.length }}</div></n-card></n-gi>
        <n-gi><n-card size="small"><div class="stat-label err">逾期</div><div class="stat-value err">{{ overdueTasks.length }}</div></n-card></n-gi>
      </n-grid>

      <!-- 任務警示（§16：優先顯示 今日 → 逾期 → 即將到期） -->
      <template v-for="section in [
          { title: `今日任務（${todayTasks.length}）`, list: todayTasks },
          { title: `逾期任務（${overdueTasks.length}）`, list: overdueTasks },
          { title: `即將到來任務（${upcomingTasks.length}）`, list: upcomingTasks },
        ]"
        :key="section.title"
      >
        <template v-if="section.list.length">
          <h2 class="section-title">{{ section.title }}</h2>
          <div class="task-list">
            <task-card v-for="p in section.list.slice(0, 5)" :key="p.assignment.id" :info="p" @execute="execute(p)" />
            <div v-if="section.list.length > 5" class="more-link clickable muted" @click="router.push('/tasks/pending')">
              還有 {{ section.list.length - 5 }} 項，前往待執行任務 →
            </div>
          </div>
        </template>
      </template>

      <div v-if="!filteredPending.length && !loading" class="muted empty-tip">
        目前篩選的果園沒有待執行任務 🎉
      </div>

      <section class="settled-panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">今日結算（{{ todaySettledTasks.length }}）</div>
            <div class="muted">可取消結算，或調整本次執行備註與成本</div>
          </div>
        </div>
        <div v-if="todaySettledTasks.length" class="settled-list">
          <div v-for="batch in todaySettledTasks" :key="batch.id" class="settled-row">
            <div class="settled-main">
              <div class="settled-title">
                {{ batch.taskName }}
                <span v-if="batch.categoryName" class="cat">{{ batch.categoryName }}</span>
              </div>
              <div class="settled-path">{{ batch.targetLabel || '未指定目標' }}</div>
              <div class="settled-meta muted">
                {{ formatDateWithWeekday(settlementDate(batch)) }} ·
                {{ batch.completedItems }} / {{ batch.totalItems }}
                {{ completionLabel(batch) }}
              </div>
              <div v-if="batch.note || batch.cost != null" class="settled-note muted">
                <span v-if="batch.note">執行備註：{{ batch.note }}</span>
                <span v-if="batch.cost != null">成本 ${{ formatCost(batch.cost) }}</span>
              </div>
            </div>
            <div class="settled-actions">
              <n-button size="small" secondary @click="openBatchEditor(batch)">編輯執行資訊</n-button>
              <n-button size="small" secondary type="warning" @click="confirmCancelSettlement(batch)">
                取消結算
              </n-button>
            </div>
          </div>
        </div>
        <div v-else class="muted settled-empty">目前篩選條件沒有今日結算的任務</div>
      </section>

      <orchard-detail-drawer
        v-if="selectedOrchard"
        v-model:show="showOrchardDetail"
        :orchard-id="selectedOrchard.orchard.id"
        :orchard-name="selectedOrchard.orchard.name"
        :areas="areaStats"
        :pending="pending"
        :history="history"
        @map="openSelectedOrchardMap"
        @execute="execute"
        @reschedule-saved="refreshDetail"
      />

      <n-modal v-model:show="showBatchEditor" preset="card" title="編輯執行資訊" style="max-width: 420px">
        <div v-if="editingBatch" class="editor-target muted">
          {{ editingBatch.taskName }} · {{ editingBatch.targetLabel || '未指定目標' }}
        </div>
        <n-form label-placement="top">
          <n-form-item label="執行備註">
            <n-input v-model:value="batchNote" type="textarea" :rows="3" placeholder="選填" />
          </n-form-item>
          <n-form-item label="成本 ($)">
            <n-input-number
              v-model:value="batchCost"
              :min="0"
              :precision="0"
              clearable
              style="width: 100%"
              placeholder="選填"
            />
          </n-form-item>
          <n-button block type="primary" :loading="savingBatchDetails" @click="saveBatchDetails">儲存</n-button>
        </n-form>
      </n-modal>
    </n-spin>
  </div>
</template>

<style scoped>
.stat-label {
  font-size: 12px;
  color: #8a8f96;
}

.stat-label.warn,
.stat-value.warn {
  color: #f0a020;
}

.stat-label.info,
.stat-value.info {
  color: #2080f0;
}

.stat-label.err,
.stat-value.err {
  color: #d03050;
}

.dashboard-tools {
  margin: 12px 0 14px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-row .n-select {
  flex: 0 1 320px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
}

.orchard-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 9px;
}

.links-label {
  font-size: 12px;
}

.orchard-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.orchard-link-name {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.orchard-link-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.more-link {
  text-align: center;
  padding: 6px;
}

.empty-tip {
  padding: 16px;
  text-align: center;
}

.settled-panel {
  margin-top: 18px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.settled-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settled-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #f0f1f3;
  padding-top: 9px;
}

.settled-main {
  min-width: 0;
  flex: 1;
}

.settled-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 700;
}

.settled-path {
  overflow: hidden;
  margin-top: 2px;
  color: #555b61;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settled-meta,
.settled-note {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
}

.settled-note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.settled-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.settled-empty {
  padding: 12px 0 2px;
  text-align: center;
}

.editor-target {
  margin-bottom: 12px;
}

@media (max-width: 560px) {
  .filter-row,
  .settled-row {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-row .n-select {
    flex-basis: auto;
    max-width: none;
  }

  .orchard-link-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .orchard-link-actions,
  .settled-actions {
    justify-content: flex-start;
  }
}

.err {
  color: #d03050;
}

</style>
