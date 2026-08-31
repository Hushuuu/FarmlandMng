<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NEmpty, NSelect, NSpin, NTab, NTabs, useMessage } from 'naive-ui'
import ScheduleTimeline from '../components/analytics/ScheduleTimeline.vue'
import { createAnalyticsRange, getTaskScheduleAnalytics } from '../services/scheduleAnalyticsService'
import type {
  AnalyticsAreaRef,
  AnalyticsOrchardRef,
  ScheduleAnalyticsResult,
  ScheduleEvent,
  TimelineLane,
  TimelineRow,
} from '../types/analytics'
import { formatDate } from '../utils/date'

type AnalyticsView = 'SCOPE' | 'TASK'

const route = useRoute()
const message = useMessage()

const loading = ref(true)
const activeView = ref<AnalyticsView>(
  typeof route.query.view === 'string' && route.query.view.toUpperCase() === 'TASK' ? 'TASK' : 'SCOPE',
)
const snapshot = ref<ScheduleAnalyticsResult | null>(null)
const selectedOrchardId = ref('ALL')
const selectedAreaId = ref('ALL')
const selectedTaskId = ref('ALL')
let queryApplied = false

function queryString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function inactiveLabel(active: boolean): string {
  return active ? '' : '（已停用）'
}

function orchardName(id: string | null): string {
  if (!id) return '未指定果園'
  const orchard = snapshot.value?.orchards.find((item) => item.id === id)
  return orchard ? `${orchard.name}${inactiveLabel(orchard.active)}` : '未指定果園'
}

function areaName(area: AnalyticsAreaRef): string {
  return `${area.name}${inactiveLabel(area.active)}`
}

const range = computed(() => snapshot.value?.range ?? createAnalyticsRange())
const events = computed(() => snapshot.value?.events ?? [])

const orchardOptions = computed(() => [
  { label: '全部果園', value: 'ALL' },
  ...(snapshot.value?.orchards ?? []).map((orchard: AnalyticsOrchardRef) => ({
    label: `${orchard.name}${inactiveLabel(orchard.active)}`,
    value: orchard.id,
  })),
])

const areaOptions = computed(() => {
  const selectedOrchard = selectedOrchardId.value
  const areas = (snapshot.value?.areas ?? []).filter(
    (area) => selectedOrchard === 'ALL' || area.orchardId === selectedOrchard,
  )
  return [
    { label: '全部區域', value: 'ALL' },
    ...areas.map((area) => ({ label: areaName(area), value: area.id })),
  ]
})

const taskOptions = computed(() => [
  { label: '全部任務', value: 'ALL' },
  ...(snapshot.value?.tasks ?? []).map((task) => ({
    label: `${task.name}${inactiveLabel(task.active)}`,
    value: task.id,
  })),
])

watch(selectedOrchardId, (orchardId) => {
  if (
    selectedAreaId.value !== 'ALL' &&
    !(snapshot.value?.areas ?? []).some(
      (area) => area.id === selectedAreaId.value && (orchardId === 'ALL' || area.orchardId === orchardId),
    )
  ) {
    selectedAreaId.value = 'ALL'
  }
})

function eventMatchesFilters(event: ScheduleEvent): boolean {
  if (selectedOrchardId.value !== 'ALL' && event.orchardId !== selectedOrchardId.value) return false
  if (selectedAreaId.value !== 'ALL' && !event.areaIds.includes(selectedAreaId.value)) return false
  if (selectedTaskId.value !== 'ALL' && event.taskId !== selectedTaskId.value) return false
  return true
}

function eventSummary(list: ScheduleEvent[]): string {
  const actual = list.filter((event) => event.source === 'ACTUAL').length
  const forecast = list.length - actual
  return ''
  return `${actual} 筆歷史 · ${forecast} 筆預測`
}

function lanesFromEvents(list: ScheduleEvent[]): TimelineLane[] {
  const grouped = new Map<string, ScheduleEvent[]>()
  for (const event of list) {
    const events = grouped.get(event.assignmentId)
    if (events) events.push(event)
    else grouped.set(event.assignmentId, [event])
  }
  return [...grouped.entries()]
    .map(([assignmentId, events]) => ({
      id: assignmentId,
      label: events[0]?.targetLabel ?? '未指定目標',
      events,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

const scopeRows = computed<TimelineRow[]>(() => {
  const grouped = new Map<string, ScheduleEvent[]>()
  for (const event of events.value) {
    if (!eventMatchesFilters(event)) continue
    const list = grouped.get(event.taskId)
    if (list) list.push(event)
    else grouped.set(event.taskId, [event])
  }

  return [...grouped.entries()]
    .map(([taskId, list]) => {
      const task = snapshot.value?.tasks.find((item) => item.id === taskId)
      const category = list.find((event) => event.categoryName)?.categoryName
      const lanes = lanesFromEvents(list)
      return {
        id: taskId,
        label: task?.name ?? list[0]?.taskName ?? '未命名任務',
        subtitle: [category, ``, eventSummary(list)].filter(Boolean).join(' · '),
        lanes,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
})

const taskRows = computed<TimelineRow[]>(() => {
  if (selectedTaskId.value === 'ALL') return []

  const filteredEvents = events.value.filter(eventMatchesFilters)
  const visibleAreas = (snapshot.value?.areas ?? [])
    .filter((area) => selectedOrchardId.value === 'ALL' || area.orchardId === selectedOrchardId.value)
    .filter((area) => selectedAreaId.value === 'ALL' || area.id === selectedAreaId.value)
    .filter((area) => filteredEvents.some((event) => event.areaIds.includes(area.id)))

  return visibleAreas
    .map((area) => {
      const areaEvents = filteredEvents.filter((event) => event.areaIds.includes(area.id))
      const lanes = lanesFromEvents(areaEvents)
      return {
        id: area.id,
        label: areaName(area),
        subtitle: `${orchardName(area.orchardId)}`,
        lanes,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
})

const rows = computed(() => (activeView.value === 'SCOPE' ? scopeRows.value : taskRows.value))
const currentTaskName = computed(
  () => snapshot.value?.tasks.find((task) => task.id === selectedTaskId.value)?.name ?? '',
)
const selectedScopeName = computed(() => {
  if (selectedAreaId.value !== 'ALL') {
    const area = snapshot.value?.areas.find((item) => item.id === selectedAreaId.value)
    return area ? `${orchardName(area.orchardId)} / ${areaName(area)}` : '指定區域'
  }
  if (selectedOrchardId.value !== 'ALL') return orchardName(selectedOrchardId.value)
  return '全部果園'
})

const chartTitle = computed(() =>
  activeView.value === 'SCOPE'
    ? `${selectedScopeName.value} · 任務時間軸`
    : `${currentTaskName.value || '選擇任務'} · 跨區域週期軌道`,
)

const chartDescription = computed(() =>
  activeView.value === 'SCOPE'
    ? '固定果園／區域，觀察不同任務在過去與未來的發生規律。'
    : '固定任務，沿各區域比較歷史執行與未來預計週期。',
)

function applyQuerySelection() {
  if (queryApplied || !snapshot.value) return
  const queryOrchard = queryString(route.query.orchard)
  const queryArea = queryString(route.query.area)
  const queryTask = queryString(route.query.task)

  if (queryOrchard && snapshot.value.orchards.some((orchard) => orchard.id === queryOrchard)) {
    selectedOrchardId.value = queryOrchard
  }
  if (
    queryArea &&
    snapshot.value.areas.some(
      (area) => area.id === queryArea && (selectedOrchardId.value === 'ALL' || area.orchardId === selectedOrchardId.value),
    )
  ) {
    selectedAreaId.value = queryArea
  }
  if (queryTask && snapshot.value.tasks.some((task) => task.id === queryTask)) {
    selectedTaskId.value = queryTask
  } else if (activeView.value === 'TASK' && snapshot.value.tasks.length) {
    selectedTaskId.value = snapshot.value.tasks[0]!.id
  }
  queryApplied = true
}

async function load() {
  loading.value = true
  try {
    snapshot.value = await getTaskScheduleAnalytics()
    applyQuerySelection()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '載入任務分析失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page analytics-page">
    <div class="head-row">
      <div>
        <h1 class="page-title">任務分析</h1>
        <div class="muted">前六個月至後六個月之任務紀錄與預定排程</div>
      </div>
      <n-button size="small" secondary :loading="loading" @click="load">重新整理</n-button>
    </div>

    <n-tabs v-model:value="activeView" type="segment" size="small" animated>
      <n-tab name="SCOPE">地點視角</n-tab>
      <n-tab name="TASK">任務視角</n-tab>
    </n-tabs>

    <div class="filters">
      <n-select v-model:value="selectedOrchardId" :options="orchardOptions" size="small" filterable />
      <n-select v-model:value="selectedAreaId" :options="areaOptions" size="small" filterable />
      <n-select v-model:value="selectedTaskId" :options="taskOptions" size="small" filterable />
    </div>

    <n-spin :show="loading">
      <section class="chart-panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">{{ chartTitle }}</div>
            <div class="muted">{{ chartDescription }}</div>
          </div>
          <div class="range-label muted">
            {{ formatDate(range.from) }} ～ {{ formatDate(range.to) }}
          </div>
        </div>

        <div class="legend">
          <span class="legend-item"><i class="legend-mark actual" />歷史／實際</span>
          <span class="legend-item"><i class="legend-mark forecast" />未來預測</span>
          <span class="legend-item"><i class="legend-mark today" />今天</span>
        </div>

        <n-empty
          v-if="activeView === 'TASK' && selectedTaskId === 'ALL' && !loading"
          description="請先選擇要比較的任務"
          style="padding: 36px 0"
        />
        <schedule-timeline
          v-else
          :rows="rows"
          :from="range.from"
          :to="range.to"
          :today="range.today"
          :label-title="activeView === 'SCOPE' ? '任務' : '區域'"
          empty-text="目前篩選條件沒有可顯示的任務事件"
        />

        <div class="forecast-note">
          未來事件依啟用中的任務週期、最近結算日與下一輪日期即時計算；目前執行中的批次，其後續週期為暫估。
        </div>
      </section>
    </n-spin>
  </div>
</template>

<style scoped>
.analytics-page {
  max-width: 1180px;
}

.head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.filters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;
}

.chart-panel {
  padding: 12px 0;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
}

.range-label {
  white-space: nowrap;
}

.legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #697178;
  font-size: 12px;
}

.legend-mark {
  display: inline-block;
  width: 18px;
  height: 10px;
  border-radius: 3px;
}

.legend-mark.actual {
  background: #18a058;
}

.legend-mark.forecast {
  border: 1.5px dashed #7c5ce5;
  background: rgba(124, 92, 229, 0.16);
}

.legend-mark.today {
  width: 2px;
  height: 14px;
  margin: 0 8px;
  border-radius: 0;
  background: #d03050;
}

.forecast-note {
  margin-top: 10px;
  color: #8a8f96;
  font-size: 12px;
}

@media (max-width: 560px) {
  .head-row,
  .panel-head {
    flex-direction: column;
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .range-label {
    white-space: normal;
  }
}
</style>
