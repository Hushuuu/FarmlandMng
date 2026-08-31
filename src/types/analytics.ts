import type { BatchStatus, RecurrenceUnit, TargetType } from './database'

export type AnalyticsEventPhase = 'HISTORY' | 'FORECAST'
export type AnalyticsEventSource = 'ACTUAL' | 'FORECAST'
export type ForecastKind = 'NEXT_START_DATE' | 'RECURRENCE' | 'IN_PROGRESS_PROJECTION'

export interface ScheduleEvent {
  id: string
  phase: AnalyticsEventPhase
  source: AnalyticsEventSource
  date: string
  endDate: string | null
  taskId: string
  taskCode: string
  taskName: string
  categoryName: string | null
  assignmentId: string
  targetType: TargetType
  targetLabel: string
  orchardId: string | null
  areaIds: string[]
  batchId: string | null
  batchStatus: BatchStatus | null
  scheduledDate: string
  completedDate: string | null
  recurrenceValue: number | null
  recurrenceUnit: RecurrenceUnit | null
  forecastKind: ForecastKind | null
}

export interface AnalyticsRange {
  from: string
  to: string
  today: string
}

export interface AnalyticsOrchardRef {
  id: string
  code: string
  name: string
  active: boolean
}

export interface AnalyticsAreaRef {
  id: string
  orchardId: string
  code: string
  name: string
  active: boolean
}

export interface AnalyticsTaskRef {
  id: string
  code: string
  name: string
  active: boolean
}

export interface ScheduleAnalyticsResult {
  range: AnalyticsRange
  events: ScheduleEvent[]
  orchards: AnalyticsOrchardRef[]
  areas: AnalyticsAreaRef[]
  tasks: AnalyticsTaskRef[]
}

export interface TimelineLane {
  id: string
  label: string
  events: ScheduleEvent[]
}

export interface TimelineRow {
  id: string
  label: string
  subtitle?: string
  lanes: TimelineLane[]
}
