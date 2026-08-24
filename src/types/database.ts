export type TargetType = 'ORCHARD' | 'AREA' | 'TREE'
export type RecurrenceUnit = 'DAY' | 'WEEK' | 'MONTH'
export type BatchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type ItemStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'FAILED'
export type TreeStatus = 'NORMAL' | 'SICK' | 'DEAD' | 'REMOVED'

export interface BaseRow {
  id: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  active: boolean
}

export interface TreeType extends BaseRow {
  code: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  sort_order: number
  active: boolean
}

export interface Orchard extends BaseRow {
  code: string
  name: string
  description: string | null
  map_width: number
  map_height: number
  active: boolean
}

export interface Area extends BaseRow {
  orchard_id: string
  code: string
  name: string
  description: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  rotation: number
  active: boolean
}

export interface Tree extends BaseRow {
  area_id: string
  tree_type_id: string | null
  code: string
  name: string | null
  position_x: number
  position_y: number
  status: TreeStatus
  planted_at: string | null
  note: string | null
  active: boolean
}

export interface TaskCategory extends BaseRow {
  code: string
  name: string
  description: string | null
  sort_order: number
  active: boolean
}

export interface Task extends BaseRow {
  code: string
  name: string
  category_id: string | null
  description: string | null
  active: boolean
}

export interface TaskAssignment extends BaseRow {
  task_id: string
  target_type: TargetType
  target_id: string
  start_date: string
  next_start_date: string | null
  recurrence_value: number | null
  recurrence_unit: RecurrenceUnit | null
  active: boolean
  note: string | null
}

export interface ExecutionBatch extends BaseRow {
  task_assignment_id: string
  scheduled_date: string
  started_at: string | null
  completed_at: string | null
  status: BatchStatus
  note: string | null
  created_by: string | null
}

export interface ExecutionItem extends BaseRow {
  execution_batch_id: string
  tree_id: string
  status: ItemStatus
  executed_at: string | null
  operator_id: string | null
  note: string | null
}

export interface SystemSetting {
  key: string
  value: string | null
  description: string | null
}

/** 任務到期狀態（前端計算） */
export type DueStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'FUTURE'

export interface PendingTaskInfo {
  assignment: TaskAssignment
  task: Task
  category: TaskCategory | null
  targetLabel: string
  targetPath: string
  orchardId: string | null
  areaId: string | null
  treeCount: number
  dueDate: string | null
  dueStatus: DueStatus
  lastCompletedDate: string | null
  runningBatchId: string | null
}

export interface BatchSummary extends ExecutionBatch {
  taskId: string
  taskName: string
  categoryName: string | null
  targetType: TargetType
  orchardId: string | null
  areaId: string | null
  /** 果園 / 區域（/ 樹）完整路徑 */
  targetLabel: string
  totalItems: number
  completedItems: number
}
