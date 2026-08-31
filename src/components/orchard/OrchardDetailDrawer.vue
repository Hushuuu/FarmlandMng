<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NCard, NDrawer, NDrawerContent, NEmpty, NSpin, NTag } from 'naive-ui'
import type { AreaStats } from '../../services/statsService'
import type { BatchSummary, PendingTaskInfo } from '../../types/database'
import DueStatusTag from '../task/DueStatusTag.vue'
import TaskRescheduleModal from '../task/TaskRescheduleModal.vue'
import { formatDate } from '../../utils/date'

const props = withDefaults(
  defineProps<{
    show: boolean
    orchardId: string
    orchardName: string
    areas: AreaStats[]
    pending: PendingTaskInfo[]
    history: BatchSummary[]
    loading?: boolean
  }>(),
  { loading: false },
)

const emit = defineEmits<{
  'update:show': [boolean]
  map: []
  execute: [PendingTaskInfo]
  'reschedule-saved': []
}>()

const showReschedule = ref(false)
const rescheduleInfo = ref<PendingTaskInfo | null>(null)

const selectedAreas = computed(() =>
  props.areas.filter((areaStats) => areaStats.area.orchard_id === props.orchardId),
)

const orchardTasks = computed(() =>
  props.pending.filter(
    (task) => task.orchardId === props.orchardId && task.assignment.target_type === 'ORCHARD',
  ),
)

const treeCount = computed(() => selectedAreas.value.reduce((sum, area) => sum + area.treeCount, 0))

function areaTasks(areaId: string): PendingTaskInfo[] {
  return props.pending.filter((task) => task.orchardId === props.orchardId && task.areaId === areaId)
}

function taskSettledCount(assignmentId: string): number {
  return props.history.filter(
    (batch) => batch.status === 'COMPLETED' && batch.task_assignment_id === assignmentId,
  ).length
}

function openReschedule(info: PendingTaskInfo) {
  rescheduleInfo.value = info
  showReschedule.value = true
}

function rescheduleLabel(task: PendingTaskInfo): string {
  return task.runningBatchId || task.dueStatus === 'OVERDUE' ? '展延日期' : '調整日期'
}

function executeTask(task: PendingTaskInfo) {
  emit('execute', task)
}

function handleRescheduleSaved() {
  emit('reschedule-saved')
}
</script>

<template>
  <n-drawer
    :show="show"
    placement="right"
    width="min(420px, 100vw)"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <n-drawer-content :title="orchardName" closable>
      <n-spin :show="loading">
        <div class="detail-head">
          <div class="muted">
            {{ selectedAreas.length }} 個區域 · {{ treeCount }} 棵果樹
          </div>
          <n-button size="small" secondary type="primary" @click="emit('map')">進入地圖</n-button>
        </div>

        <n-card v-if="orchardTasks.length" size="small" class="orchard-task-card">
          <div class="area-detail-head">
            <div class="area-detail-name">果園任務</div>
          </div>
          <div class="area-task-list">
            <div v-for="task in orchardTasks" :key="task.assignment.id" class="area-task-row">
              <div class="area-task-name">
                <div class="area-task-title">{{ task.task.name }}</div>
                <div v-if="task.assignment.note" class="area-task-note muted">
                  指派備註：{{ task.assignment.note }}
                </div>
                <div class="area-task-meta">
                  <span class="muted area-task-date">{{ formatDate(task.dueDate) }}</span>
                  <span class="settled">已結算 {{ taskSettledCount(task.assignment.id) }} 次</span>
                </div>
              </div>
              <div class="area-task-actions">
                <due-status-tag :status="task.dueStatus" />
                <n-tag v-if="task.runningBatchId && task.dueStatus !== 'OVERDUE'" size="tiny" type="info" round>
                  執行中
                </n-tag>
                <n-button size="tiny" @click="openReschedule(task)">
                  {{ rescheduleLabel(task) }}
                </n-button>
                <n-button size="tiny" type="primary" @click="executeTask(task)">
                  {{ task.runningBatchId ? '繼續' : '執行' }}
                </n-button>
              </div>
            </div>
          </div>
        </n-card>

        <n-empty v-if="!selectedAreas.length && !loading" description="目前沒有有效區域" style="padding: 24px 0" />
        <div v-else-if="selectedAreas.length" class="area-detail-list">
          <n-card v-for="area in selectedAreas" :key="area.area.id" size="small" class="area-detail-card">
            <div class="area-detail-head">
              <div>
                <div class="area-detail-name">{{ area.area.name }}</div>
                <div class="muted">{{ area.treeCount }} 棵果樹</div>
              </div>
            </div>

            <div v-if="areaTasks(area.area.id).length" class="area-task-list">
              <div v-for="task in areaTasks(area.area.id)" :key="task.assignment.id" class="area-task-row">
                <div class="area-task-name">
                  <div class="area-task-title">
                    {{ task.task.name }}
                    <!-- <span class="muted">· {{ task.targetLabel }}</span> -->
                  </div>
                  <div v-if="task.assignment.note" class="area-task-note muted">
                    指派備註：{{ task.assignment.note }}
                  </div>
                  <div class="area-task-meta">
                    <span class="muted area-task-date">{{ formatDate(task.dueDate) }}</span>
                    <span class="settled">已結算 {{ taskSettledCount(task.assignment.id) }} 次</span>
                  </div>
                </div>
                <div class="area-task-actions">
                  <due-status-tag :status="task.dueStatus" />
                  <n-tag v-if="task.runningBatchId && task.dueStatus !== 'OVERDUE'" size="tiny" type="info" round>
                    執行中
                  </n-tag>
                  <n-button size="tiny" @click="openReschedule(task)">
                    {{ rescheduleLabel(task) }}
                  </n-button>
                  <n-button size="tiny" type="primary" @click="executeTask(task)">
                    {{ task.runningBatchId ? '繼續' : '執行' }}
                  </n-button>
                </div>
              </div>
            </div>
            <div v-else class="muted area-task-empty">尚未指派任務</div>
          </n-card>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>

  <task-reschedule-modal
    v-model:show="showReschedule"
    :info="rescheduleInfo"
    @saved="handleRescheduleSaved"
  />
</template>

<style scoped>
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

.settled {
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
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}

.area-task-name {
  flex: 1 1 140px;
  min-width: 0;
}

.area-task-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.area-task-note {
  margin-top: 2px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.area-task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.area-task-date {
  white-space: nowrap;
}

.area-task-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1 1 180px;
  flex-wrap: wrap;
  gap: 6px;
}

.area-task-empty {
  margin-top: 8px;
  font-size: 12px;
}
</style>
