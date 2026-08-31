import type { DueStatus, RecurrenceUnit } from '../types/database'

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function addCalendarMonths(dateStr: string, months: number): string {
  const source = parseDate(dateStr)
  const sourceDay = source.getDate()
  const sourceLastDay = new Date(source.getFullYear(), source.getMonth() + 1, 0).getDate()
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1)
  const targetLastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const targetDay = sourceDay === sourceLastDay ? targetLastDay : Math.min(sourceDay, targetLastDay)
  target.setDate(targetDay)
  return toDateStr(target)
}

export function addInterval(dateStr: string, value: number, unit: RecurrenceUnit): string {
  const d = parseDate(dateStr)
  if (unit === 'DAY') d.setDate(d.getDate() + value)
  else if (unit === 'WEEK') d.setDate(d.getDate() + value * 7)
  else return addCalendarMonths(dateStr, value)
  return toDateStr(d)
}

export function startOfMonth(dateStr: string): string {
  const d = parseDate(dateStr)
  d.setDate(1)
  return toDateStr(d)
}

export function endOfMonth(dateStr: string): string {
  const d = parseDate(dateStr)
  d.setMonth(d.getMonth() + 1, 0)
  return toDateStr(d)
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000)
}

/** 計算任務到期狀態 */
export function computeDueStatus(
  dueDate: string | null,
  warningDays: number,
  today = todayStr(),
): DueStatus | null {
  if (!dueDate) return null
  const gap = diffDays(today, dueDate) // 正 = 未來，0 = 今天，負 = 已逾期
  if (gap < 0) return 'OVERDUE'
  if (gap === 0) return 'DUE_TODAY'
  if (gap <= warningDays) return 'UPCOMING'
  return 'FUTURE'
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDate(s: string | null | undefined): string {
  if (!s) return '-'
  const d = s.length > 10 ? new Date(s) : parseDate(s)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateWithWeekday(s: string | null | undefined): string {
  if (!s) return '-'
  const d = s.length > 10 ? new Date(s) : parseDate(s)
  return `${formatDate(s)} (${WEEKDAYS[d.getDay()]})`
}
