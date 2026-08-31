<script setup lang="ts">
import { computed } from 'vue'
import type { BatchStatus } from '../../types/database'
import type { ScheduleEvent, TimelineLane, TimelineRow } from '../../types/analytics'
import { formatDate, parseDate } from '../../utils/date'
import { recurrenceText } from '../../constants/status'

const LABEL_WIDTH = 154
const CHART_WIDTH = 1120
const HEADER_HEIGHT = 52
const LANE_HEIGHT = 28
const MIN_ROW_HEIGHT = 64
const ROW_PADDING = 8

const props = withDefaults(
  defineProps<{
    rows: TimelineRow[]
    from: string
    to: string
    today: string
    labelTitle: string
    emptyText?: string
  }>(),
  { emptyText: '目前範圍沒有可顯示的任務' },
)

interface MonthTick {
  key: string
  label: string
  x: number
}

const rangeStart = computed(() => parseDate(props.from).getTime())
const rangeEnd = computed(() => parseDate(props.to).getTime())
const stageWidth = computed(() => LABEL_WIDTH + CHART_WIDTH)

interface TimelineRowModel {
  row: TimelineRow
  lanes: TimelineLane[]
  height: number
}

const rowModels = computed<TimelineRowModel[]>(() =>
  props.rows.map((row) => {
    const lanes = row.lanes.length ? row.lanes : [{ id: row.id, label: row.label, events: [] }]
    return {
      row,
      lanes,
      height: Math.max(MIN_ROW_HEIGHT, lanes.length * LANE_HEIGHT + ROW_PADDING),
    }
  }),
)

function xFor(date: string): number {
  const total = rangeEnd.value - rangeStart.value
  if (total <= 0) return 0
  const ratio = (parseDate(date).getTime() - rangeStart.value) / total
  return Math.max(0, Math.min(CHART_WIDTH, ratio * CHART_WIDTH))
}

const todayX = computed(() => xFor(props.today))

const monthTicks = computed<MonthTick[]>(() => {
  const start = parseDate(props.from)
  const end = parseDate(props.to)
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const ticks: MonthTick[] = []

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    ticks.push({
      key,
      label: `${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      x: xFor(`${key}-01`),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return ticks
})

function laneY(height: number, laneIndex: number, laneCount: number): number {
 const contentHeight = laneCount * LANE_HEIGHT
 return (height - contentHeight) / 2 + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2
}

function eventOffset(events: ScheduleEvent[], event: ScheduleEvent): number {
 const sameDate = events.filter((item) => item.date === event.date)
 if (sameDate.length <= 1) return 0
 const index = sameDate.findIndex((item) => item.id === event.id)
 return (index - (sameDate.length - 1) / 2) * 8
}

function actualColor(status: BatchStatus | null): string {
  if (status === 'IN_PROGRESS') return '#2080f0'
  if (status === 'CANCELLED') return '#d03050'
  return '#18a058'
}

function eventStroke(event: ScheduleEvent): string {
  return event.source === 'ACTUAL' ? actualColor(event.batchStatus) : '#7c5ce5'
}

function eventTitle(event: ScheduleEvent): string {
  const source = '' //event.source === 'ACTUAL' ? '歷史實際' : '未來預測'
  const date = formatDate(event.date)
  const status =
    event.batchStatus === 'COMPLETED'
      ? '已完成'
      : event.batchStatus === 'IN_PROGRESS'
        ? '執行中'
        : ''
  const recurrence = recurrenceText(event.recurrenceValue, event.recurrenceUnit)
  // const forecast =
  //   event.forecastKind === 'IN_PROGRESS_PROJECTION'
  //     ? '依目前執行批次暫估'
  //     : event.forecastKind === 'NEXT_START_DATE'
  //       ? '依下一輪日期'
  //       : ''
  const forecast = ''
  const completed =
    event.completedDate && event.completedDate !== event.date
      ? `結算 ${formatDate(event.completedDate)}`
      : ''
  return [source, event.taskName, date, event.targetLabel, status, recurrence, completed, forecast]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <div class="timeline-scroll">
    <div
      class="timeline-grid"
      :style="{
        width: `${stageWidth}px`,
        gridTemplateColumns: `${LABEL_WIDTH}px ${CHART_WIDTH}px`,
      }"
    >
      <div class="timeline-label-head">{{ labelTitle }}</div>
      <svg
        class="timeline-axis"
        :width="CHART_WIDTH"
        :height="HEADER_HEIGHT"
        role="img"
        aria-label="任務時間軸"
      >
        <rect :width="CHART_WIDTH" :height="HEADER_HEIGHT" fill="#fafbfc" />
        <g v-for="tick in monthTicks" :key="tick.key">
          <line :x1="tick.x" y1="0" :x2="tick.x" :y2="HEADER_HEIGHT" stroke="#e5e7eb" />
          <text
            :x="tick.x + (tick.x > CHART_WIDTH - 70 ? -4 : 4)"
            y="22"
            fill="#697178"
            font-size="11"
            :text-anchor="tick.x > CHART_WIDTH - 70 ? 'end' : 'start'"
          >
            {{ tick.label }}
          </text>
        </g>
        <line
          :x1="todayX"
          y1="0"
          :x2="todayX"
          :y2="HEADER_HEIGHT"
          stroke="#d03050"
          stroke-width="2"
          stroke-dasharray="5 4"
        />
        <text :x="Math.min(CHART_WIDTH - 4, todayX + 5)" y="42" fill="#d03050" font-size="11">
          今天
        </text>
      </svg>

      <template v-if="rows.length">
        <template v-for="model in rowModels" :key="model.row.id">
          <div class="timeline-row-label" :style="{ height: `${model.height}px` }">
            <div class="row-label">{{ model.row.label }}</div>
            <div v-if="model.row.subtitle" class="row-subtitle">{{ model.row.subtitle }}</div>
          </div>
          <svg
            class="timeline-row"
            :width="CHART_WIDTH"
            :height="model.height"
            role="img"
            :aria-label="`${model.row.label} 任務時間軸`"
          >
            <rect :width="CHART_WIDTH" :height="model.height" fill="#fff" />
            <template v-for="(lane, laneIndex) in model.lanes" :key="lane.id">
              <line
                v-for="tick in monthTicks"
                :key="`${lane.id}:${tick.key}`"
                :x1="tick.x"
                y1="0"
                :x2="tick.x"
                :y2="model.height"
                stroke="#f0f1f3"
              />
              <line
                x1="0"
                :y1="laneY(model.height, laneIndex, model.lanes.length)"
                :x2="CHART_WIDTH"
                :y2="laneY(model.height, laneIndex, model.lanes.length)"
                stroke="#eef0f2"
              />
              <g
                v-for="event in lane.events"
                :key="event.id"
                :transform="`translate(0 ${laneY(model.height, laneIndex, model.lanes.length) + eventOffset(lane.events, event)})`"
              >
                <title>{{ eventTitle(event) }}</title>
                <circle
                  v-if="event.source === 'ACTUAL'"
                  :cx="xFor(event.date)"
                  cy="0"
                  r="5"
                  :fill="eventStroke(event)"
                />
                <circle
                  v-else
                  :cx="xFor(event.date)"
                  cy="0"
                  r="6"
                  fill="#fff"
                  stroke="#7c5ce5"
                  stroke-width="1.8"
                  stroke-dasharray="3 2"
                />
              </g>
            </template>
            <line
              :x1="todayX"
              y1="0"
              :x2="todayX"
              :y2="model.height"
              stroke="#d03050"
              stroke-width="2"
              stroke-dasharray="5 4"
            />
            <line x1="0" :y1="model.height - 1" :x2="CHART_WIDTH" :y2="model.height - 1" stroke="#e8eaf0" />
          </svg>
        </template>
      </template>
      <div v-else class="timeline-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.timeline-scroll {
  overflow-x: auto;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
  background: #fff;
  -webkit-overflow-scrolling: touch;
}

.timeline-grid {
  display: grid;
  align-items: stretch;
}

.timeline-label-head,
.timeline-row-label {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
  border-right: 1px solid #e8eaf0;
}

.timeline-label-head {
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid #e8eaf0;
  color: #697178;
  font-size: 12px;
  font-weight: 700;
}

.timeline-axis {
  display: block;
  border-bottom: 1px solid #e8eaf0;
}

.timeline-row-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid #e8eaf0;
}

.row-label {
  overflow: hidden;
  color: #24282b;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-subtitle {
  overflow: hidden;
  color: #8a8f96;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-row {
  display: block;
  border-bottom: 1px solid #e8eaf0;
}

.timeline-empty {
  grid-column: 1 / -1;
  padding: 36px 16px;
  color: #8a8f96;
  text-align: center;
}

@media (max-width: 560px) {
  .timeline-label-head,
  .timeline-row-label {
    width: 154px;
  }
}
</style>
