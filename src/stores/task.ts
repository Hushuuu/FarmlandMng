import { defineStore } from 'pinia'
import {
  assignmentService,
  cancelBatch,
  completeAllItems,
  hardDeleteAssignment,
  hardDeleteTask,
  finishBatch,
  getBatchWithItems,
  getPendingTasks,
  listBatchSummaries,
  setItemStatus,
  setItemsStatus as setExecutionItemsStatus,
  startExecution,
  taskCrudService,
  getBatchContext,
  updateBatchDetails,
} from '../services/taskService'
import type { BatchSummary, ExecutionBatch, ExecutionItem, ItemStatus, PendingTaskInfo, Task, TaskAssignment } from '../types/database'
import { useMasterStore } from './tree'

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as (Task & { assignments: TaskAssignment[] })[],
    pending: [] as PendingTaskInfo[],
    loading: false,

    activeBatch: null as ExecutionBatch | null,
    activeItems: [] as (ExecutionItem & { tree: import('../types/database').Tree | null })[],
    executionSheetOpen: false,
    history: [] as BatchSummary[],

    executing: false,
    activeBatchTargetName: null as string | null,
    activeAssignmentNote: null as string | null,
  }),

  getters: {
    overdueCount: (s) => s.pending.filter((p) => p.dueStatus === 'OVERDUE').length,
    todayCount: (s) => s.pending.filter((p) => p.dueStatus === 'DUE_TODAY').length,
    upcomingCount: (s) => s.pending.filter((p) => p.dueStatus === 'UPCOMING').length,
    progress: (s) => {
      const total = s.activeItems.length
      if (!total) return 0
      const done = s.activeItems.filter(
        (i) => i.status === 'COMPLETED' || i.status === 'SKIPPED',
      ).length
      return Math.round((done / total) * 100)
    },
  },

  actions: {
    async loadTasks() {
      this.loading = true
      try {
        const tasks = await taskCrudService.list(true)
        const withAssignments = await Promise.all(
          tasks.map(async (t) => ({
            ...t,
            assignments: await assignmentService.listByTask(t.id),
          })),
        )
        this.tasks = withAssignments
      } finally {
        this.loading = false
      }
    },

    async createTask(input: Partial<Task>) {
      const t = await taskCrudService.create(input)
      await this.loadTasks()
      return t
    },

    async updateTask(id: string, input: Partial<Task>) {
      await taskCrudService.update(id, input)
      await this.loadTasks()
    },

    async softDeleteTask(id: string) {
      await taskCrudService.softDelete(id)
      await this.loadTasks()
    },

    async createAssignment(input: Partial<TaskAssignment>) {
      const a = await assignmentService.create(input)
      await this.loadTasks()
      return a
    },

    async updateAssignment(id: string, input: Partial<TaskAssignment>) {
      await assignmentService.update(id, input)
      await this.loadTasks()
    },

    async softDeleteAssignment(id: string) {
      await assignmentService.softDelete(id)
      await this.loadTasks()
    },

    async hardDeleteAssignment(id: string) {
      await hardDeleteAssignment(id)
      await this.loadTasks()
    },

    async hardDeleteTask(id: string) {
      await hardDeleteTask(id)
      await this.loadTasks()
    },

    // --------------------------------------------------
    // 待執行任務
    // --------------------------------------------------
    async loadPending() {
      this.loading = true
      try {
        await useMasterStore().loadAll()
        this.pending = await getPendingTasks()
      } finally {
        this.loading = false
      }
    },

    // --------------------------------------------------
    // 執行流程（§32 / §34）
    // --------------------------------------------------
    async beginExecution(assignmentId: string) {
      this.executing = true
      try {
        const batch = await startExecution(assignmentId)
        const { items } = await getBatchWithItems(batch.id)
        const context = await getBatchContext(batch.id)
        this.activeBatch = batch
        this.activeBatchTargetName = context.targetName
        this.activeAssignmentNote = context.assignmentNote
        this.activeItems = items
        this.executionSheetOpen = true
      } finally {
        this.executing = false
      }
    },

    async resumeExecution(batchId: string) {
      this.executing = true
      try {
        const { batch, items } = await getBatchWithItems(batchId)
        const context = await getBatchContext(batch.id)
        this.activeBatch = batch
        this.activeBatchTargetName = context.targetName
        this.activeAssignmentNote = context.assignmentNote
        this.activeItems = items
        this.executionSheetOpen = true
      } finally {
        this.executing = false
      }
    },

    async toggleItem(itemId: string, status: ItemStatus) {
      await setItemStatus(itemId, status)
      const local = this.activeItems.find((i) => i.id === itemId)
      if (local) {
        local.status = status
        local.executed_at = status === 'PENDING' ? null : new Date().toISOString()
      }
    },

    async setItemsStatus(itemIds: string[], status: ItemStatus) {
      if (!itemIds.length) return
      await setExecutionItemsStatus(itemIds, status)
      const ids = new Set(itemIds)
      const executedAt = status === 'PENDING' ? null : new Date().toISOString()
      for (const item of this.activeItems) {
        if (ids.has(item.id)) {
          item.status = status
          item.executed_at = executedAt
        }
      }
    },

    async completeAll() {
      if (!this.activeBatch) return
      await completeAllItems(this.activeBatch.id)
      for (const i of this.activeItems) {
        if (i.status === 'PENDING') {
          i.status = 'COMPLETED'
          i.executed_at = new Date().toISOString()
        }
      }
    },

    async updateActiveBatchDetails(note: string | null, cost: number | null) {
      if (!this.activeBatch) return
      const normalizedNote = note?.trim() || null
      const normalizedCost = cost === null ? null : Number(cost)
      await updateBatchDetails(this.activeBatch.id, normalizedNote, normalizedCost)
      this.activeBatch.note = normalizedNote
      this.activeBatch.cost = normalizedCost
    },

    async finishExecution() {
      if (!this.activeBatch) return
      await finishBatch(this.activeBatch.id)
      this.activeBatch = null
      this.activeItems = []
      this.activeBatchTargetName = null
      this.activeAssignmentNote = null
      this.executionSheetOpen = false
      await this.loadPending()
    },

    async resetExecution() {
      if (!this.activeBatch) return
      await cancelBatch(this.activeBatch.id)
      this.activeBatch = null
      this.activeItems = []
      this.activeBatchTargetName = null
      this.activeAssignmentNote = null
      this.executionSheetOpen = false
      await this.loadPending()
    },

    async loadHistory(force = false) {
      if (this.history.length && !force) return
      this.history = await listBatchSummaries()
    },

    closeExecutionSheet() {
      this.executionSheetOpen = false
    },

    clearExecution() {
      this.activeBatch = null
      this.activeItems = []
      this.activeBatchTargetName = null
      this.activeAssignmentNote = null
      this.executionSheetOpen = false
    },
  },
})
