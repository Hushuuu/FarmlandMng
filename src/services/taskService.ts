import { supabase } from '../lib/supabase'
import type {
  Area,
  BatchSummary,
  DueStatus,
  ExecutionBatch,
  ExecutionItem,
  ItemStatus,
  Orchard,
  PendingTaskInfo,
  TargetType,
  Task,
  TaskAssignment,
  TaskCategory,
  Tree,
} from '../types/database'
import { addInterval, computeDueStatus, todayStr, toDateStr } from '../utils/date'
import { deleteExecutionData } from './hardDeleteService'
import { managementService } from './managementService'
import { settingsService } from './orchardService'

// ------------------------------------------------------------
// 任務設定（Task）
// ------------------------------------------------------------
export const taskCrudService = {
  async list(includeInactive = false): Promise<Task[]> {
    let q = supabase.from('tasks').select('*').order('code')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Task[]
  },

  async create(input: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase.from('tasks').insert(input).select().single()
    if (error) throw error
    return data as Task
  },

  async update(id: string, input: Partial<Task>): Promise<void> {
    const { error } = await supabase.from('tasks').update(input).eq('id', id)
    if (error) throw error
  },

  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false })
  },
}

// ------------------------------------------------------------
// 任務排程（Task Assignment）
// ------------------------------------------------------------
export const assignmentService = {
  async listByTask(taskId: string): Promise<TaskAssignment[]> {
    const { data, error } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('task_id', taskId)
      .order('start_date')
    if (error) throw error
    return (data ?? []) as TaskAssignment[]
  },

  async listActive(): Promise<TaskAssignment[]> {
    const { data, error } = await supabase.from('task_assignments').select('*').eq('active', true)
    if (error) throw error
    return (data ?? []) as TaskAssignment[]
  },

  async create(input: Partial<TaskAssignment>): Promise<TaskAssignment> {
    const { data, error } = await supabase.from('task_assignments').insert(input).select().single()
    if (error) throw error
    return data as TaskAssignment
  },

  async update(id: string, input: Partial<TaskAssignment>): Promise<void> {
    const { error } = await supabase.from('task_assignments').update(input).eq('id', id)
    if (error) throw error
  },

  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false })
  },
}

// ------------------------------------------------------------
// 目標解析：ORCHARD / AREA / TREE → 當下有效果樹清單（§62 核心行為）
// ------------------------------------------------------------
export async function resolveTargetTrees(
  targetType: TargetType,
  targetId: string,
): Promise<Tree[]> {
  if (targetType === 'TREE') {
    const { data, error } = await supabase.from('trees').select('*').eq('id', targetId).eq('active', true)
    if (error) throw error
    return (data ?? []) as Tree[]
  }
  if (targetType === 'AREA') {
    const { data, error } = await supabase.from('trees').select('*').eq('area_id', targetId).eq('active', true)
    if (error) throw error
    return (data ?? []) as Tree[]
  }
  // ORCHARD：果園內所有有效區域底下的有效果樹
  const { data, error } = await supabase
    .from('trees')
    .select('*, area:areas!inner(id, orchard_id)')
    .eq('area.orchard_id', targetId)
    .eq('active', true)
  if (error) throw error
  return (data ?? []) as unknown as Tree[]
}

interface TargetRefs {
  orchards: Map<string, Orchard>
  areas: Map<string, Area>
  trees: Map<string, Tree>
}

async function loadTargetRefs(assignments: TaskAssignment[]): Promise<TargetRefs> {
  const orchardIds = new Set<string>()
  const areaIds = new Set<string>()
  const treeIds = new Set<string>()
  for (const a of assignments) {
    if (a.target_type === 'ORCHARD') orchardIds.add(a.target_id)
    else if (a.target_type === 'AREA') areaIds.add(a.target_id)
    else treeIds.add(a.target_id)
  }

  const [orchardsRes, areasRes, treesRes] = await Promise.all([
    orchardIds.size ? supabase.from('orchards').select('*').in('id', [...orchardIds]) : Promise.resolve({ data: [], error: null }),
    areaIds.size ? supabase.from('areas').select('*').in('id', [...areaIds]) : Promise.resolve({ data: [], error: null }),
    treeIds.size ? supabase.from('trees').select('*').in('id', [...treeIds]) : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [orchardsRes, areasRes, treesRes]) {
    if (r.error) throw r.error
  }
  return {
    orchards: new Map(((orchardsRes.data ?? []) as Orchard[]).map((o) => [o.id, o])),
    areas: new Map(((areasRes.data ?? []) as Area[]).map((a) => [a.id, a])),
    trees: new Map(((treesRes.data ?? []) as Tree[]).map((t) => [t.id, t])),
  }
}

function targetLabelOf(refs: TargetRefs, a: TaskAssignment): { label: string; path: string } {
  if (a.target_type === 'ORCHARD') {
    const o = refs.orchards.get(a.target_id)
    return { label: o?.name ?? '?', path: o?.name ?? '?' }
  }
  if (a.target_type === 'AREA') {
    const ar = refs.areas.get(a.target_id)
    const o = ar ? refs.orchards.get(ar.orchard_id) : undefined
    return { label: ar?.name ?? '?', path: `${o?.name ?? ''} / ${ar?.name ?? '?'}` }
  }
  const t = refs.trees.get(a.target_id)
  const ar2 = t ? refs.areas.get(t.area_id) : undefined
  const o2 = ar2 ? refs.orchards.get(ar2.orchard_id) : undefined
  return { label: t?.name || t?.code || '?', path: `${o2?.name ?? ''} / ${ar2?.name ?? ''} / ${t?.code ?? '?'}` }
}

function resolveTargetIds(refs: TargetRefs, a: TaskAssignment): {
  orchardId: string | null
  areaId: string | null
} {
  if (a.target_type === 'ORCHARD') return { orchardId: a.target_id, areaId: null }
  if (a.target_type === 'AREA') {
    return { orchardId: refs.areas.get(a.target_id)?.orchard_id ?? null, areaId: a.target_id }
  }
  const t = refs.trees.get(a.target_id)
  const ar = t ? refs.areas.get(t.area_id) : undefined
  return { orchardId: ar?.orchard_id ?? null, areaId: t?.area_id ?? null }
}

/** 批次解析指定對象名稱（任務設定頁顯示用） */
export async function getTargetNameMap(
  assignments: TaskAssignment[],
): Promise<Map<string, string>> {
  const refs = await loadTargetRefs(assignments)
  const map = new Map<string, string>()
  for (const a of assignments) map.set(a.id, targetLabelOf(refs, a).label)
  return map
}

/** 單一果樹的任務歷史（§37 / §56） */
export async function getTreeHistory(
  treeId: string,
): Promise<{
  treeLabel: string
  entries: {
    batchId: string
    taskName: string
    categoryName: string | null
    targetPath: string
    scheduledDate: string
    status: BatchSummary['status']
    items: Pick<ExecutionItem, 'id' | 'status'>[]
  }[]
}> {
  const [{ data: tree }, { data: items }] = await Promise.all([
    supabase
      .from('trees')
      .select('code, name, area:areas(name, orchard:orchards(name))')
      .eq('id', treeId)
      .maybeSingle(),
    supabase
      .from('task_execution_items')
      .select('id, status, execution_batch_id, batch:task_execution_batches(*)')
      .eq('tree_id', treeId)
      .order('created_at'),
  ])
  if (!tree) throw new Error('找不到果樹')

  type TreeRow = {
    code: string
    name: string | null
    area: { name: string; orchard: { name: string } | null } | null
  }
  const t = tree as unknown as TreeRow

  type ItemRow = ExecutionItem & { batch: ExecutionBatch }
  const rows = ((items ?? []) as unknown as ItemRow[]).filter((r) => r.batch && r.batch.status !== 'CANCELLED')

  const assignmentIds = [...new Set(rows.map((r) => r.batch.task_assignment_id))]
  let aMap = new Map<string, ARowLike>()
  if (assignmentIds.length) {
    const refsRes = await supabase
      .from('task_assignments')
      .select('*, task:tasks(name, category:task_categories(name))')
      .in('id', assignmentIds)
    aMap = new Map<string, ARowLike>()
    for (const row of (refsRes.data ?? []) as unknown as ARowLike[]) aMap.set(row.id, row)
  }

  const path = `${t.area?.orchard?.name ?? ''} / ${t.area?.name ?? ''} / ${t.code}`

  const byBatch = new Map<string, ItemRow[]>()
  for (const r of rows) {
    const list = byBatch.get(r.batch.id)
    if (list) list.push(r)
    else byBatch.set(r.batch.id, [r])
  }

  const entries = [...byBatch.entries()]
    .map(([batchId, list]) => {
      const b = list[0]!.batch
      const a = aMap.get(b.task_assignment_id)
      return {
        batchId,
        taskName: a?.task?.name ?? '?',
        categoryName: a?.task?.category?.name ?? null,
        targetPath: path,
        scheduledDate: b.scheduled_date,
        status: b.status,
        items: list.map((i) => ({ id: i.id, status: i.status })),
      }
    })
    .sort((x, y) => y.scheduledDate.localeCompare(x.scheduledDate))

  return { treeLabel: t.name ? `${t.name}（${t.code}）` : t.code, entries }
}

type ARowLike = TaskAssignment & {
  task: (Task & { category: Pick<TaskCategory, 'name'> | null }) | null
}

/** 計算下一次到期日（§63：以實際完成日期起算，且可由使用者調整） */
function completedDateOf(batch: Pick<ExecutionBatch, 'scheduled_date' | 'completed_at'>): string {
  if (batch.completed_at) {
    const completedAt = new Date(batch.completed_at)
    if (!Number.isNaN(completedAt.getTime())) return toDateStr(completedAt)
  }
  return batch.scheduled_date
}

function computeNextDue(
  assignment: TaskAssignment,
  completedDates: string[],
): string | null {
  const hasRecurrence = !!assignment.recurrence_value && !!assignment.recurrence_unit
  const latestCompleted = completedDates.length
    ? completedDates.reduce((a, b) => (a > b ? a : b))
    : null
  if (!hasRecurrence) {
    return completedDates.length ? null : assignment.next_start_date ?? assignment.start_date
  }

  const naturalNext = latestCompleted
    ? addInterval(latestCompleted, assignment.recurrence_value!, assignment.recurrence_unit!)
    : assignment.start_date
  const requestedNext = assignment.next_start_date ?? naturalNext

  // 結算日當天不能再次執行，即使舊資料或手動調整日期仍指向今天。
  if (latestCompleted) {
    const earliestNext = addInterval(latestCompleted, 1, 'DAY')
    return requestedNext > earliestNext ? requestedNext : earliestNext
  }
  return requestedNext
}

// ------------------------------------------------------------
// 待執行任務（§33）：解析所有啟用中的 Assignment
// ------------------------------------------------------------
export async function getPendingTasks(filter?: {
  status?: DueStatus | 'ALL'
}): Promise<PendingTaskInfo[]> {
  const warningDays = await settingsService.getNumber('task_due_warning_days', 3)
  const assignments = await assignmentService.listActive()

  const [refs, tasksRes, catsRes, batchesRes] = await Promise.all([
    loadTargetRefs(assignments),
    supabase.from('tasks').select('*'),
    supabase.from('task_categories').select('*'),
    supabase.from('task_execution_batches').select('*'),
  ])
  for (const r of [tasksRes, catsRes, batchesRes]) if (r.error) throw r.error

  const tasksMap = new Map(((tasksRes.data ?? []) as Task[]).map((t) => [t.id, t]))
  const catsMap = new Map(((catsRes.data ?? []) as TaskCategory[]).map((c) => [c.id, c]))
  const allBatches = (batchesRes.data ?? []) as ExecutionBatch[]

  const result: PendingTaskInfo[] = []

  // 相同目標只解析一次
  const treeCache = new Map<string, Promise<Tree[]>>()
  function treesOf(a: TaskAssignment): Promise<Tree[]> {
    const key = `${a.target_type}:${a.target_id}`
    let p = treeCache.get(key)
    if (!p) {
      p = resolveTargetTrees(a.target_type, a.target_id)
      treeCache.set(key, p)
    }
    return p
  }

  for (const a of assignments) {
    const task = tasksMap.get(a.task_id)
    if (!task || !task.active) continue
    const cat = task.category_id ? catsMap.get(task.category_id) ?? null : null
    const myBatches = allBatches.filter((b) => b.task_assignment_id === a.id)
    const completedDates = myBatches
      .filter((b) => b.status === 'COMPLETED')
      .map((b) => completedDateOf(b))
    const running = myBatches.find((b) => b.status === 'IN_PROGRESS') ?? null

    // 有進行中的批次時，以該批次 scheduled_date 為目前到期日
    let dueDate: string | null = running
      ? running.scheduled_date
      : computeNextDue(a, completedDates)
    const dueStatus = computeDueStatus(dueDate, warningDays)

    // 單次任務已完成則不再顯示
    if (!dueDate) continue

    const { label, path } = targetLabelOf(refs, a)
    let treeCount = 0
    if (running) {
      const { count } = await supabase
        .from('task_execution_items')
        .select('id', { count: 'exact', head: true })
        .eq('execution_batch_id', running.id)
      treeCount = count ?? 0
    } else {
      const trees = await treesOf(a)
      treeCount = trees.length
    }
    const ids = resolveTargetIds(refs, a)

    result.push({
      assignment: a,
      task,
      category: cat,
      targetLabel: label,
      targetPath: path,
      orchardId: ids.orchardId,
      areaId: ids.areaId,
      treeCount,
      dueDate,
      dueStatus: dueStatus ?? 'FUTURE',
      lastCompletedDate: completedDates.length
        ? completedDates.reduce((x, y) => (x > y ? x : y))
        : null,
      runningBatchId: running?.id ?? null,
    })
  }

  let out = result
  if (filter?.status && filter.status !== 'ALL') {
    out = out.filter((p) => p.dueStatus === filter!.status!)
  }
  // 排序：逾期 → 今日 → 即將到期 → 未來；同狀態依到期日
  const order: Record<DueStatus, number> = { OVERDUE: 0, DUE_TODAY: 1, UPCOMING: 2, FUTURE: 3 }
  out.sort((x, y) => {
    const d = order[x.dueStatus] - order[y.dueStatus]
    return d !== 0 ? d : (x.dueDate ?? '').localeCompare(y.dueDate ?? '')
  })
  return out
}

// ------------------------------------------------------------
// 執行流程（§32 / §45 / §46）：建立 Batch + Items
// ------------------------------------------------------------
export async function startExecution(assignmentId: string): Promise<ExecutionBatch> {
  const { data: a, error: ae } = await supabase
    .from('task_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single()
  if (ae) throw ae
  const assignment = a as TaskAssignment
  if (!assignment.active) throw new Error('此任務排程已停用，無法開始執行')

  // 若已有進行中批次，直接續用
  const { data: existing, error: existingError } = await supabase
    .from('task_execution_batches')
    .select('*')
    .eq('task_assignment_id', assignment.id)
    .eq('status', 'IN_PROGRESS')
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing as ExecutionBatch

  const { data: latestCompleted, error: latestError } = await supabase
    .from('task_execution_batches')
    .select('scheduled_date, completed_at')
    .eq('task_assignment_id', assignment.id)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) throw latestError
  if (latestCompleted && completedDateOf(latestCompleted) === todayStr()) {
    throw new Error('本任務今天已結算，下一輪最早明天才能執行')
  }

  const trees = await resolveTargetTrees(assignment.target_type, assignment.target_id)
  if (!trees.length) throw new Error('此任務對象目前沒有有效果樹，無法開始執行')

  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes.user?.id ?? null

  const { data: batch, error: be } = await supabase
    .from('task_execution_batches')
    .insert({
      task_assignment_id: assignment.id,
      scheduled_date: todayStr(),
      started_at: new Date().toISOString(),
      status: 'IN_PROGRESS',
      created_by: userId,
    })
    .select()
    .single()
  if (be) throw be

  const items = trees.map((t) => ({
    execution_batch_id: (batch as ExecutionBatch).id,
    tree_id: t.id,
    status: 'PENDING' as ItemStatus,
  }))
  const { error: ie } = await supabase.from('task_execution_items').insert(items)
  if (ie) throw ie
  return batch as ExecutionBatch
}

export async function getBatchWithItems(batchId: string): Promise<{
  batch: ExecutionBatch
  items: (ExecutionItem & { tree: Tree | null })[]
}> {
  const [{ data: batch, error: be }, { data: items, error: ie }] = await Promise.all([
    supabase.from('task_execution_batches').select('*').eq('id', batchId).single(),
    supabase
      .from('task_execution_items')
      .select('*, tree:trees(*)')
      .eq('execution_batch_id', batchId)
      .order('created_at'),
  ])
  if (be) throw be
  if (ie) throw ie
  return {
    batch: batch as ExecutionBatch,
    items: ((items ?? []) as (ExecutionItem & { tree: Tree | null })[]) ?? [],
  }
}

export async function setItemStatus(itemId: string, status: ItemStatus): Promise<void> {
  const patch: Partial<ExecutionItem> = { status }
  patch.executed_at = status === 'PENDING' ? null : new Date().toISOString()
  const { data: userRes } = await supabase.auth.getUser()
  if (userRes.user) patch.operator_id = userRes.user.id
  const { error } = await supabase.from('task_execution_items').update(patch).eq('id', itemId)
  if (error) throw error
}

/** 全部完成：剩餘 PENDING 一律標記完成 */
export async function completeAllItems(batchId: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('task_execution_items')
    .update({
      status: 'COMPLETED',
      executed_at: new Date().toISOString(),
      operator_id: userRes.user?.id ?? null,
    })
    .eq('execution_batch_id', batchId)
    .eq('status', 'PENDING')
  if (error) throw error
}

export async function finishBatch(batchId: string): Promise<void> {
  const { data: batch, error: batchError } = await supabase
    .from('task_execution_batches')
    .select('id, task_assignment_id, scheduled_date, status')
    .eq('id', batchId)
    .single()
  if (batchError) throw batchError

  const { data: assignment, error: assignmentError } = await supabase
    .from('task_assignments')
    .select('id, recurrence_value, recurrence_unit')
    .eq('id', batch.task_assignment_id)
    .single()
  if (assignmentError) throw assignmentError

  const completionDate = todayStr()
  const nextStartDate =
    assignment.recurrence_value && assignment.recurrence_unit
      ? addInterval(completionDate, assignment.recurrence_value, assignment.recurrence_unit) > completionDate
        ? addInterval(completionDate, assignment.recurrence_value, assignment.recurrence_unit)
        : addInterval(completionDate, 1, 'DAY')
      : null

  const { error } = await supabase
    .from('task_execution_batches')
    .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
    .eq('id', batchId)
  if (error) throw error

  const { error: nextDateError } = await supabase
    .from('task_assignments')
    .update({ next_start_date: nextStartDate })
    .eq('id', batch.task_assignment_id)
  if (nextDateError) throw nextDateError
}

export async function cancelBatch(batchId: string): Promise<void> {
  const { error } = await supabase
    .from('task_execution_batches')
    .update({ status: 'CANCELLED' })
    .eq('id', batchId)
  if (error) throw error
}

/** 撤銷結算，保留逐樹進度並恢復為可繼續執行。 */
export async function cancelSettlement(batchId: string): Promise<void> {
  const { data: batch, error: batchError } = await supabase
    .from('task_execution_batches')
    .select('id, task_assignment_id, scheduled_date, completed_at, status')
    .eq('id', batchId)
    .single()
  if (batchError) throw batchError
  if (batch.status !== 'COMPLETED') throw new Error('只有已完成的批次可以取消結算')

  const { data: latestBatch, error: latestError } = await supabase
    .from('task_execution_batches')
    .select('id')
    .eq('task_assignment_id', batch.task_assignment_id)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) throw latestError
  if (latestBatch?.id !== batchId) throw new Error('只能取消最近一次結算')

  const { error } = await supabase
    .from('task_execution_batches')
    .update({ status: 'IN_PROGRESS', completed_at: null })
    .eq('id', batchId)
    .eq('status', 'COMPLETED')
  if (error) throw error

  const { error: assignmentError } = await supabase
    .from('task_assignments')
    .update({ next_start_date: null })
    .eq('id', batch.task_assignment_id)
  if (assignmentError) throw assignmentError
}

/** 管理模式專用：永久刪除單一執行批次及其逐樹明細。 */
export async function hardDeleteBatch(batchId: string): Promise<void> {
  managementService.assertUnlocked()
  const { data: batch, error: batchError } = await supabase
    .from('task_execution_batches')
    .select('id, task_assignment_id, scheduled_date, completed_at, status')
    .eq('id', batchId)
    .maybeSingle()
  if (batchError) throw batchError
  if (!batch) throw new Error('找不到執行批次')

  let resetNextDate = false
  if (batch.status === 'COMPLETED') {
    const { data: latestBatch, error: latestError } = await supabase
      .from('task_execution_batches')
      .select('id')
      .eq('task_assignment_id', batch.task_assignment_id)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('scheduled_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError
    resetNextDate = latestBatch?.id === batchId
  }

  const { error: itemError } = await supabase
    .from('task_execution_items')
    .delete()
    .eq('execution_batch_id', batchId)
  if (itemError) throw itemError
  const { error } = await supabase
    .from('task_execution_batches')
    .delete()
    .eq('id', batchId)
  if (error) throw error

  if (resetNextDate) {
    const { error: assignmentError } = await supabase
      .from('task_assignments')
      .update({ next_start_date: null })
      .eq('id', batch.task_assignment_id)
    if (assignmentError) throw assignmentError
  }
}

/** 管理模式專用：永久刪除任務排程及其所有執行紀錄。 */
export async function hardDeleteAssignment(assignmentId: string): Promise<void> {
  managementService.assertUnlocked()
  const { data: assignment, error: assignmentError } = await supabase
    .from('task_assignments')
    .select('id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (assignmentError) throw assignmentError
  if (!assignment) throw new Error('找不到任務排程')

  await deleteExecutionData([assignmentId], [])
  const { error } = await supabase.from('task_assignments').delete().eq('id', assignmentId)
  if (error) throw error
}

/** 管理模式專用：永久刪除任務設定、排程與所有執行紀錄。 */
export async function hardDeleteTask(taskId: string): Promise<void> {
  managementService.assertUnlocked()
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .maybeSingle()
  if (taskError) throw taskError
  if (!task) throw new Error('找不到任務')

  const { data: assignments, error: assignmentError } = await supabase
    .from('task_assignments')
    .select('id')
    .eq('task_id', taskId)
  if (assignmentError) throw assignmentError
  const assignmentIds = (assignments ?? []).map((row) => row.id)
  await deleteExecutionData(assignmentIds, [])
  if (assignmentIds.length) {
    const { error } = await supabase.from('task_assignments').delete().in('id', assignmentIds)
    if (error) throw error
  }
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

// ------------------------------------------------------------
// 歷史紀錄（§37）
// ------------------------------------------------------------
export async function listBatchSummaries(limit = 200): Promise<BatchSummary[]> {
  const [{ data: batches, error }, refsRes] = await Promise.all([
    supabase
      .from('task_execution_batches')
      .select('*')
      .neq('status', 'CANCELLED')
      .order('scheduled_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('task_assignments')
      .select('*, task:tasks(*, category:task_categories(name))'),
  ])
  if (error) throw error
  if (refsRes.error) throw refsRes.error

  type ARow = TaskAssignment & { task: (Task & { category: Pick<TaskCategory, 'name'> | null }) | null }
  const aRows = (refsRes.data ?? []) as ARow[]
  const aMap = new Map<string, ARow>(aRows.map((row) => [row.id, row]))
  const refs = await loadTargetRefs(aRows)

  const batchList = (batches ?? []) as ExecutionBatch[]
  const ids = batchList.map((b) => b.id)

  const counts: Record<string, { total: number; done: number }> = {}
  if (ids.length) {
    const { data: items, error: ie } = await supabase
      .from('task_execution_items')
      .select('execution_batch_id, status')
      .in('execution_batch_id', ids)
    if (ie) throw ie
    for (const it of (items ?? []) as Pick<ExecutionItem, 'execution_batch_id' | 'status'>[]) {
      const c = (counts[it.execution_batch_id] ??= { total: 0, done: 0 })
      c.total++
      if (it.status === 'COMPLETED') c.done++
    }
  }

  return batchList.map((b) => {
    const a = aMap.get(b.task_assignment_id)
    const ids = a ? resolveTargetIds(refs, a) : { orchardId: null, areaId: null }
    return {
      ...b,
      taskId: a?.task?.id ?? '',
      taskName: a?.task?.name ?? '?',
      categoryName: a?.task?.category?.name ?? null,
      targetType: a?.target_type ?? 'ORCHARD',
      orchardId: ids.orchardId,
      areaId: ids.areaId,
      targetLabel: a ? targetLabelOf(refs, a).path : '',
      totalItems: counts[b.id]?.total ?? 0,
      completedItems: counts[b.id]?.done ?? 0,
    }
  })
}
