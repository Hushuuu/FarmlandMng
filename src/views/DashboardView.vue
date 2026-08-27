<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NDrawer, NDrawerContent, NEmpty, NGrid, NGi, NSpin, NTag, useMessage } from 'naive-ui'
import { statsService } from '../services/statsService'
import type { AreaStats, OrchardStats } from '../services/statsService'
import { getPendingTasks, listBatchSummaries } from '../services/taskService'
import type { BatchSummary, PendingTaskInfo } from '../types/database'
import TaskCard from '../components/task/TaskCard.vue'
import DueStatusTag from '../components/task/DueStatusTag.vue'
import { useTaskStore } from '../stores/task'

const router = useRouter()
const taskStore = useTaskStore()
const message = useMessage()

const loading = ref(true)
const counts = ref({ orchards: 0, areas: 0, trees: 0 })
const orchardStats = ref<OrchardStats[]>([])
const areaStats = ref<AreaStats[]>([])
const pending = ref<PendingTaskInfo[]>([])
const history = ref<BatchSummary[]>([])
const showOrchardDetail = ref(false)
const selectedOrchard = ref<OrchardStats | null>(null)

const todayTasks = computed(() => pending.value.filter((p) => p.dueStatus === 'DUE_TODAY'))
const overdueTasks = computed(() => pending.value.filter((p) => p.dueStatus === 'OVERDUE'))
const upcomingTasks = computed(() => pending.value.filter((p) => p.dueStatus === 'UPCOMING'))

/** 每個果園的待執行 / 逾期統計（§14） */
function orchardCounts(orchardId: string) {
  const list = pending.value.filter((p) => p.orchardId === orchardId)
  return {
    total: list.length,
    today: list.filter((p) => p.dueStatus === 'DUE_TODAY').length,
    upcoming: list.filter((p) => p.dueStatus === 'UPCOMING').length,
    overdue: list.filter((p) => p.dueStatus === 'OVERDUE').length,
  }
}

const selectedAreas = computed(() =>
  selectedOrchard.value
    ? areaStats.value.filter((a) => a.area.orchard_id === selectedOrchard.value!.orchard.id)
    : [],
)

const selectedOrchardTasks = computed(() =>
  selectedOrchard.value
    ? pending.value.filter(
        (p) =>
          p.orchardId === selectedOrchard.value!.orchard.id &&
          p.assignment.target_type === 'ORCHARD',
      )
    : [],
)

function areaTasks(orchardId: string, areaId: string): PendingTaskInfo[] {
  return pending.value.filter(
    (p) => p.orchardId === orchardId && p.areaId === areaId,
  )
}

function areaTaskCounts(orchardId: string, areaId: string) {
  const list = areaTasks(orchardId, areaId)
  return {
    total: list.length,
    today: list.filter((p) => p.dueStatus === 'DUE_TODAY').length,
    upcoming: list.filter((p) => p.dueStatus === 'UPCOMING').length,
    overdue: list.filter((p) => p.dueStatus === 'OVERDUE').length,
    running: list.filter((p) => !!p.runningBatchId).length,
  }
}

function settledCount(orchardId: string, areaId: string): number {
  return history.value.filter(
    (b) =>
      b.status === 'COMPLETED' &&
      b.orchardId === orchardId &&
      b.areaId === areaId,
  ).length
}

function orchardSettledCount(orchardId: string): number {
  return history.value.filter(
    (b) => b.status === 'COMPLETED' && b.orchardId === orchardId && b.targetType === 'ORCHARD',
  ).length
}

function openOrchardDetail(stats: OrchardStats) {
  selectedOrchard.value = stats
  showOrchardDetail.value = true
}

function openSelectedOrchardMap() {
  if (!selectedOrchard.value) return
  showOrchardDetail.value = false
  router.push(`/orchards/${selectedOrchard.value.orchard.id}/map`)
}

async function execute(p: PendingTaskInfo) {
  try {
    await taskStore.beginExecution(p.assignment.id)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '無法開始執行')
  }
}

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

      <div v-if="!pending.length && !loading" class="muted empty-tip">
        目前沒有待處理的任務 🎉
      </div>

      <!-- 果園總覽（§14 / §15） -->
      <h2 class="section-title">果園狀況</h2>
      <div class="orchard-cards">
        <n-card
          v-for="os in orchardStats"
          :key="os.orchard.id"
          size="small"
          class="clickable orchard-card"
          @click="openOrchardDetail(os)"
        >
          <div class="oc-head">
            <span class="oc-name">{{ os.orchard.name }}</span>
            <div class="oc-actions">
              <n-button size="tiny" quaternary @click.stop="openOrchardDetail(os)">查看狀況</n-button>
              <n-button size="tiny" quaternary type="primary" @click.stop="router.push(`/orchards/${os.orchard.id}/map`)">
                地圖 →
              </n-button>
            </div>
          </div>
          <div class="oc-stats">
            <div><span class="muted">區域</span> {{ os.areaCount }}</div>
            <div><span class="muted">果樹</span> {{ os.treeCount }}</div>
            <div :class="{ warn: orchardCounts(os.orchard.id).today > 0 }">
              <span class="muted">今日任務</span> {{ orchardCounts(os.orchard.id).today }}
            </div>
            <div :class="{ err: orchardCounts(os.orchard.id).overdue > 0 }">
              <span class="muted">逾期</span> {{ orchardCounts(os.orchard.id).overdue }}
            </div>
          </div>
          <!-- <div class="muted oc-hint">點擊查看區域與任務執行狀況</div> -->
        </n-card>
        <n-card v-if="!orchardStats.length" size="small">
          <div class="muted">還沒有果園，先到「果園列表」建立一個吧。</div>
        </n-card>
      </div>

      <n-drawer v-model:show="showOrchardDetail" placement="right" width="min(420px, 100vw)">
        <n-drawer-content
          v-if="selectedOrchard"
          :title="`${selectedOrchard.orchard.name}`"
          closable
        >
          <div class="detail-head">
            <div class="muted">
              {{ selectedOrchard.areaCount }} 個區域 · {{ selectedOrchard.treeCount }} 棵果樹
            </div>
            <n-button size="small" secondary type="primary" @click="openSelectedOrchardMap">進入地圖</n-button>
          </div>

          <n-card
            v-if="selectedOrchardTasks.length || orchardSettledCount(selectedOrchard.orchard.id)"
            size="small"
            class="orchard-task-card"
          >
            <div class="area-detail-head">
              <div>
                <div class="area-detail-name">果園任務</div>
                <!-- <div class="muted">套用整座果園的任務</div> -->
              </div>
              <span class="settled">已結算 {{ orchardSettledCount(selectedOrchard.orchard.id) }} 次</span>
            </div>
            <div v-if="selectedOrchardTasks.length" class="area-task-list">
              <div
                v-for="task in selectedOrchardTasks"
                :key="task.assignment.id"
                class="area-task-row"
              >
                <div class="area-task-name">{{ task.task.name }}</div>
                <due-status-tag :status="task.dueStatus" />
                <n-tag v-if="task.runningBatchId" size="tiny" type="info" round>執行中</n-tag>
                <n-button size="tiny" type="primary" @click="execute(task)">
                  {{ task.runningBatchId ? '繼續' : '執行' }}
                </n-button>
              </div>
            </div>
            <div v-else class="muted area-task-empty">目前沒有待執行的果園層級任務</div>
          </n-card>

          <n-empty v-if="!selectedAreas.length" description="目前沒有有效區域" style="padding: 24px 0" />
          <div v-else class="area-detail-list">
            <n-card v-for="area in selectedAreas" :key="area.area.id" size="small" class="area-detail-card">
              <div class="area-detail-head">
                <div>
                  <div class="area-detail-name">{{ area.area.name }}</div>
                  <div class="muted">{{ area.treeCount }} 棵果樹</div>
                </div>
                <n-tag v-if="areaTaskCounts(selectedOrchard.orchard.id, area.area.id).overdue" size="tiny" type="error" round>
                  逾期 {{ areaTaskCounts(selectedOrchard.orchard.id, area.area.id).overdue }}
                </n-tag>
              </div>

              <div class="area-detail-stats">
                <span>任務 {{ areaTaskCounts(selectedOrchard.orchard.id, area.area.id).total }}</span>
                <span class="warn">今日 {{ areaTaskCounts(selectedOrchard.orchard.id, area.area.id).today }}</span>
                <span class="info">執行中 {{ areaTaskCounts(selectedOrchard.orchard.id, area.area.id).running }}</span>
                <span class="settled">已結算 {{ settledCount(selectedOrchard.orchard.id, area.area.id) }} 次</span>
              </div>

              <div v-if="areaTasks(selectedOrchard.orchard.id, area.area.id).length" class="area-task-list">
                <div
                  v-for="task in areaTasks(selectedOrchard.orchard.id, area.area.id)"
                  :key="task.assignment.id"
                  class="area-task-row"
                >
                  <div class="area-task-name">
                    {{ task.task.name }}
                    <span class="muted">· {{ task.targetLabel }}</span>
                  </div>
                  <due-status-tag :status="task.dueStatus" />
                  <n-tag v-if="task.runningBatchId" size="tiny" type="info" round>執行中</n-tag>
                  <n-button size="tiny" type="primary" @click="execute(task)">
                    {{ task.runningBatchId ? '繼續' : '執行' }}
                  </n-button>
                </div>
              </div>
              <div v-else class="muted area-task-empty">尚未指派任務</div>
            </n-card>
          </div>
        </n-drawer-content>
      </n-drawer>
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

.orchard-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.oc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.oc-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.oc-name {
  font-size: 15px;
  font-weight: 700;
}

.oc-stats {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
}

.oc-hint {
  margin-top: 8px;
  font-size: 12px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.orchard-task-card {
  margin-bottom: 8px;
}

.area-detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.area-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.area-detail-name {
  font-size: 14px;
  font-weight: 700;
}

.area-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
}

.area-detail-stats .info {
  color: #2080f0;
}

.area-detail-stats .settled {
  color: var(--primary);
}

.area-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
}

.area-task-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.area-task-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.area-task-empty {
  margin-top: 8px;
  font-size: 12px;
}

.warn {
  color: #f0a020;
}

.err {
  color: #d03050;
}

</style>
