import type { BatchStatus, DueStatus, ItemStatus, RecurrenceUnit, TargetType, TreeStatus } from '../types/database'

export const TREE_STATUS_META: Record<TreeStatus, { label: string; color: string }> = {
  NORMAL: { label: '正常', color: '#36ad6a' },
  SICK: { label: '生病', color: '#f0a020' },
  DEAD: { label: '死亡', color: '#7b8085' },
  REMOVED: { label: '已移除', color: '#d03050' },
}

export const DUE_STATUS_META: Record<DueStatus, { label: string; type: 'error' | 'warning' | 'info' | 'default' }> = {
  OVERDUE: { label: '逾期', type: 'error' },
  DUE_TODAY: { label: '今日任務', type: 'warning' },
  UPCOMING: { label: '即將到來', type: 'info' },
  FUTURE: { label: '排程中', type: 'default' },
}

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; type: 'success' | 'default' | 'warning' | 'error' }> = {
  PENDING: { label: '待執行', type: 'default' },
  COMPLETED: { label: '完成', type: 'success' },
  SKIPPED: { label: '略過', type: 'warning' },
  FAILED: { label: '失敗', type: 'error' },
}

export const BATCH_STATUS_META: Record<BatchStatus, { label: string; type: 'info' | 'success' | 'error' }> = {
  IN_PROGRESS: { label: '執行中', type: 'info' },
  COMPLETED: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'error' },
}

export const TARGET_TYPE_LABEL: Record<TargetType, string> = {
  ORCHARD: '果園',
  AREA: '區域',
  TREE: '果樹',
}

export const RECURRENCE_UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: 'DAY', label: '天' },
  { value: 'WEEK', label: '週' },
  { value: 'MONTH', label: '個月' },
]

export function recurrenceText(value: number | null, unit: RecurrenceUnit | null): string {
  if (!value || !unit) return '單次'
  const unitLabel = RECURRENCE_UNIT_OPTIONS.find((o) => o.value === unit)?.label ?? unit
  return `每 ${value} ${unitLabel}`
}
