import { supabase } from '../lib/supabase'
import { computeNextDue, completedDateOf } from './taskService'
import type { BatchStatus, RecurrenceUnit, TaskAssignment } from '../types/database'
import type {
  AnalyticsAreaRef,
  AnalyticsOrchardRef,
  AnalyticsRange,
  AnalyticsTaskRef,
  ForecastKind,
  ScheduleAnalyticsResult,
  ScheduleEvent,
} from '../types/analytics'
import {
  addCalendarMonths,
  addInterval,
  diffDays,
  endOfMonth,
  parseDate,
  startOfMonth,
  todayStr,
  toDateStr,
} from '../utils/date'

interface TaskRow {
  id: string
  code: string
  name: string
  active: boolean
  category: { name: string } | { name: string }[] | null
}

interface AssignmentRow extends TaskAssignment {
  task: TaskRow | TaskRow[] | null
}

interface OrchardRow {
  id: string
  code: string
  name: string
  active: boolean
}

interface AreaRow {
  id: string
  orchard_id: string
  code: string
  name: string
  active: boolean
}

interface TreeRow {
  id: string
  area_id: string
  code: string
  name: string | null
  active: boolean
}

interface BatchRow {
  id: string
  task_assignment_id: string
  scheduled_date: string
  started_at: string | null
  completed_at: string | null
  status: BatchStatus
}

interface AssignmentScope {
  orchardId: string | null
  areaIds: string[]
  targetLabel: string
  active: boolean
}

interface AssignmentInfo {
  row: AssignmentRow
  task: TaskRow
  scope: AssignmentScope
}

interface ScheduleAnalyticsOptions {
  from?: string
  to?: string
  today?: string
}

function relationOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value.length ? (value[0] as T) : null
  return value ?? null
}

function dateOfTimestamp(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : toDateStr(d)
}

function defaultRange(today = todayStr()): AnalyticsRange {
  return {
    from: startOfMonth(addCalendarMonths(today, -6)),
    to: endOfMonth(addCalendarMonths(today, 6)),
    today,
  }
}

function rangeOf(options: ScheduleAnalyticsOptions): AnalyticsRange {
  const fallback = defaultRange(options.today)
  return {
    from: options.from ?? fallback.from,
    to: options.to ?? fallback.to,
    today: options.today ?? fallback.today,
  }
}

function firstOccurrenceOnOrAfter(
  anchor: string,
  target: string,
  value: number,
  unit: RecurrenceUnit,
): string {
  if (anchor >= target) return anchor

  if (unit === 'DAY' || unit === 'WEEK') {
    const stepDays = unit === 'DAY' ? value : value * 7
    const steps = Math.ceil(diffDays(anchor, target) / stepDays)
    return addInterval(anchor, Math.max(0, steps), unit)
  }

  const anchorDate = parseDate(anchor)
  const targetDate = parseDate(target)
  const monthDelta =
    (targetDate.getFullYear() - anchorDate.getFullYear()) * 12 +
    targetDate.getMonth() -
    anchorDate.getMonth()
  let cursor = addInterval(anchor, Math.max(0, Math.floor(monthDelta / value) - 1) * value, unit)

  while (cursor < target) {
    const next = addInterval(cursor, value, unit)
    if (next <= cursor) return cursor
    cursor = next
  }
  return cursor
}

function buildScope(
  assignment: AssignmentRow,
  orchards: Map<string, OrchardRow>,
  areas: Map<string, AreaRow>,
  trees: Map<string, TreeRow>,
  allAreas: AreaRow[],
): AssignmentScope {
  if (assignment.target_type === 'ORCHARD') {
    const orchard = orchards.get(assignment.target_id)
    return {
      orchardId: assignment.target_id,
      areaIds: allAreas
        .filter((area) => area.orchard_id === assignment.target_id)
        .map((area) => area.id),
      targetLabel: orchard?.name ?? `果園 ${assignment.target_id.slice(0, 8)}`,
      active: orchard?.active ?? false,
    }
  }

  if (assignment.target_type === 'AREA') {
    const area = areas.get(assignment.target_id)
    const orchard = area ? orchards.get(area.orchard_id) : undefined
    return {
      orchardId: area?.orchard_id ?? null,
      areaIds: area ? [area.id] : [],
      targetLabel: area ? `${orchard?.name ?? ''} / ${area.name}`.replace(/^ \/ /, '') : `區域 ${assignment.target_id.slice(0, 8)}`,
      active: !!area?.active && !!orchard?.active,
    }
  }

  const tree = trees.get(assignment.target_id)
  const area = tree ? areas.get(tree.area_id) : undefined
  const orchard = area ? orchards.get(area.orchard_id) : undefined
  const treeLabel = tree?.name ? `${tree.name}（${tree.code}）` : tree?.code
  return {
    orchardId: area?.orchard_id ?? null,
    areaIds: area ? [area.id] : [],
    targetLabel: [orchard?.name, area?.name, treeLabel].filter(Boolean).join(' / ') || `果樹 ${assignment.target_id.slice(0, 8)}`,
    active: !!tree?.active && !!area?.active && !!orchard?.active,
  }
}

function toTaskRef(task: TaskRow): AnalyticsTaskRef {
  return { id: task.id, code: task.code, name: task.name, active: task.active }
}

function toEventBase(info: AssignmentInfo) {
  const category = relationOf(info.task.category)
  return {
    taskId: info.task.id,
    taskCode: info.task.code,
    taskName: info.task.name,
    categoryName: category?.name ?? null,
    assignmentId: info.row.id,
    targetType: info.row.target_type,
    targetLabel: info.scope.targetLabel,
    orchardId: info.scope.orchardId,
    areaIds: info.scope.areaIds,
    recurrenceValue: info.row.recurrence_value,
    recurrenceUnit: info.row.recurrence_unit,
  }
}

function actualEvent(batch: BatchRow, info: AssignmentInfo): ScheduleEvent {
  const completedDate = dateOfTimestamp(batch.completed_at)
  return {
    id: `batch:${batch.id}`,
    phase: 'HISTORY',
    source: 'ACTUAL',
    date: batch.scheduled_date,
    endDate: null,
    ...toEventBase(info),
    batchId: batch.id,
    batchStatus: batch.status,
    scheduledDate: batch.scheduled_date,
    completedDate,
    forecastKind: null,
  }
}

function forecastEvent(
  info: AssignmentInfo,
  date: string,
  forecastKind: ForecastKind,
): ScheduleEvent {
  return {
    id: `forecast:${info.row.id}:${date}`,
    phase: 'FORECAST',
    source: 'FORECAST',
    date,
    endDate: null,
    ...toEventBase(info),
    batchId: null,
    batchStatus: null,
    scheduledDate: date,
    completedDate: null,
    forecastKind,
  }
}

function addForecastEvents(
  events: ScheduleEvent[],
  info: AssignmentInfo,
  completedDates: string[],
  runningBatch: BatchRow | undefined,
  range: AnalyticsRange,
) {
  const assignment = info.row
  const hasRecurrence = !!assignment.recurrence_value && !!assignment.recurrence_unit

  let anchor: string | null
  let forecastKind: ForecastKind
  if (runningBatch) {
    if (!hasRecurrence) return
    anchor = addInterval(runningBatch.scheduled_date, assignment.recurrence_value!, assignment.recurrence_unit!)
    forecastKind = 'IN_PROGRESS_PROJECTION'
  } else {
    anchor = computeNextDue(assignment, completedDates)
    forecastKind = assignment.next_start_date ? 'NEXT_START_DATE' : 'RECURRENCE'
  }
  if (!anchor) return

  if (!hasRecurrence) {
    if (anchor >= range.today && anchor <= range.to) {
      events.push(forecastEvent(info, anchor, forecastKind))
    }
    return
  }

  let cursor = firstOccurrenceOnOrAfter(
    anchor,
    range.today,
    assignment.recurrence_value!,
    assignment.recurrence_unit!,
  )
  let count = 0
  while (cursor <= range.to && count < 1000) {
    events.push(forecastEvent(info, cursor, forecastKind))
    const next = addInterval(cursor, assignment.recurrence_value!, assignment.recurrence_unit!)
    if (next <= cursor) break
    cursor = next
    count++
  }
}

export function createAnalyticsRange(today = todayStr()): AnalyticsRange {
  return defaultRange(today)
}

export async function getTaskScheduleAnalytics(
  options: ScheduleAnalyticsOptions = {},
): Promise<ScheduleAnalyticsResult> {
  const range = rangeOf(options)
  const [batchesRes, assignmentsRes, orchardsRes, areasRes] = await Promise.all([
    supabase
      .from('task_execution_batches')
      .select('id, task_assignment_id, scheduled_date, started_at, completed_at, status')
      .neq('status', 'CANCELLED')
      .gte('scheduled_date', range.from)
      .lte('scheduled_date', range.to)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('task_assignments')
      .select(
        'id, task_id, target_type, target_id, start_date, next_start_date, recurrence_value, recurrence_unit, active, note, created_at, updated_at, task:tasks(id, code, name, active, category:task_categories(name))',
      ),
    supabase.from('orchards').select('id, code, name, active').order('code'),
    supabase.from('areas').select('id, orchard_id, code, name, active').order('orchard_id').order('code'),
  ])

  for (const result of [batchesRes, assignmentsRes, orchardsRes, areasRes]) {
    if (result.error) throw result.error
  }

  const assignmentRows = (assignmentsRes.data ?? []) as unknown as AssignmentRow[]
  const orchardRows = (orchardsRes.data ?? []) as OrchardRow[]
  const areaRows = (areasRes.data ?? []) as AreaRow[]
  const orchardMap = new Map(orchardRows.map((orchard) => [orchard.id, orchard]))
  const areaMap = new Map(areaRows.map((area) => [area.id, area]))
  const treeIds = assignmentRows
    .filter((assignment) => assignment.target_type === 'TREE')
    .map((assignment) => assignment.target_id)

  const activeAssignments = assignmentRows.filter((assignment) => {
    const task = relationOf(assignment.task)
    return assignment.active && !!task?.active
  })
  const activeAssignmentIds = activeAssignments.map((assignment) => assignment.id)
  const completedAssignmentIds = activeAssignments
    .filter((assignment) => {
      const hasRecurrence = !!assignment.recurrence_value && !!assignment.recurrence_unit
      return !hasRecurrence || !assignment.next_start_date
    })
    .map((assignment) => assignment.id)

  const [treesRes, completedRes, runningRes] = await Promise.all([
    treeIds.length
      ? supabase.from('trees').select('id, area_id, code, name, active').in('id', treeIds)
      : Promise.resolve({ data: [], error: null }),
    completedAssignmentIds.length
      ? supabase
          .from('task_execution_batches')
          .select('task_assignment_id, scheduled_date, completed_at')
          .in('task_assignment_id', completedAssignmentIds)
          .eq('status', 'COMPLETED')
          .order('completed_at', { ascending: false, nullsFirst: false })
          .order('scheduled_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    activeAssignmentIds.length
      ? supabase
          .from('task_execution_batches')
          .select('id, task_assignment_id, scheduled_date, started_at, completed_at, status')
          .in('task_assignment_id', activeAssignmentIds)
          .eq('status', 'IN_PROGRESS')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [treesRes, completedRes, runningRes]) {
    if (result.error) throw result.error
  }

  const treeRows = (treesRes.data ?? []) as unknown as TreeRow[]
  const treeMap = new Map(treeRows.map((tree) => [tree.id, tree]))
  const infoMap = new Map<string, AssignmentInfo>()
  for (const assignment of assignmentRows) {
    const task = relationOf(assignment.task)
    if (!task) continue
    infoMap.set(assignment.id, {
      row: assignment,
      task,
      scope: buildScope(assignment, orchardMap, areaMap, treeMap, areaRows),
    })
  }

  const completedByAssignment = new Map<string, string[]>()
  for (const row of (completedRes.data ?? []) as unknown as Pick<BatchRow, 'task_assignment_id' | 'scheduled_date' | 'completed_at'>[]) {
    const dates = completedByAssignment.get(row.task_assignment_id)
    const date = completedDateOf(row)
    if (dates) dates.push(date)
    else completedByAssignment.set(row.task_assignment_id, [date])
  }

  const runningByAssignment = new Map<string, BatchRow>()
  for (const row of (runningRes.data ?? []) as unknown as BatchRow[]) {
    if (!runningByAssignment.has(row.task_assignment_id)) runningByAssignment.set(row.task_assignment_id, row)
  }

  const events: ScheduleEvent[] = []
  for (const batch of (batchesRes.data ?? []) as unknown as BatchRow[]) {
    const info = infoMap.get(batch.task_assignment_id)
    if (info) events.push(actualEvent(batch, info))
  }

  for (const assignment of activeAssignments) {
    const info = infoMap.get(assignment.id)
    if (!info || !info.scope.active) continue
    addForecastEvents(
      events,
      info,
      completedByAssignment.get(assignment.id) ?? [],
      runningByAssignment.get(assignment.id),
      range,
    )
  }

  events.sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date)
    if (dateOrder !== 0) return dateOrder
    return left.source === right.source ? 0 : left.source === 'ACTUAL' ? -1 : 1
  })

  const taskMap = new Map<string, AnalyticsTaskRef>()
  for (const info of infoMap.values()) taskMap.set(info.task.id, toTaskRef(info.task))

  return {
    range,
    events,
    orchards: orchardRows.map<AnalyticsOrchardRef>((orchard) => ({
      id: orchard.id,
      code: orchard.code,
      name: orchard.name,
      active: orchard.active,
    })),
    areas: areaRows.map<AnalyticsAreaRef>((area) => ({
      id: area.id,
      orchardId: area.orchard_id,
      code: area.code,
      name: area.name,
      active: area.active,
    })),
    tasks: [...taskMap.values()].sort((left, right) => left.code.localeCompare(right.code)),
  }
}
