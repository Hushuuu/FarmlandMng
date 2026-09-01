<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCard, NTag } from 'naive-ui'
import type { PendingTaskInfo } from '../../types/database'
import { recurrenceText } from '../../constants/status'
import { formatDate } from '../../utils/date'
import DueStatusTag from './DueStatusTag.vue'

const props = defineProps<{
  info: PendingTaskInfo
  loading?: boolean
  allowReschedule?: boolean
}>()

const emit = defineEmits<{ execute: []; reschedule: [] }>()

const running = computed(() => !!props.info.runningBatchId)
const overdue = computed(() => props.info.dueStatus === 'OVERDUE')
</script>

<template>
  <n-card size="small" :bordered="true" class="task-card">
    <div class="card-main">
      <div class="card-top">
        <n-tag v-if="info.category" size="small" :bordered="false" type="success">
          {{ info.category.name }}
        </n-tag>
        <span v-else class="muted">未分類</span>
        <DueStatusTag :status="info.dueStatus" />
        <n-tag v-if="running && !overdue" size="small" type="info" round>執行中</n-tag>
      </div>

      <div class="card-name">{{ info.task.name }}</div>
      <div class="card-sub">
        {{ info.targetPath }}
        <span class="dot">·</span>
        {{ info.treeCount }} 棵
      </div>
      <div v-if="info.assignment.note" class="card-note muted">
        備註：{{ info.assignment.note }}
      </div>
      <div class="card-meta muted">
        到期：{{ formatDate(info.dueDate) }}
        <template v-if="info.lastCompletedDate">　上次完成：{{ formatDate(info.lastCompletedDate) }}</template>
        　{{ recurrenceText(info.assignment.recurrence_value, info.assignment.recurrence_unit) }}
      </div>
    </div>

    <div class="card-action">
      <n-button v-if="allowReschedule" size="small" @click="emit('reschedule')">
        {{ running ? '展延日期' : overdue ? '展延日期' : '展延預計日' }}
      </n-button>
      <n-button type="primary" :loading="loading" size="small" @click="emit('execute')">
        {{ running ? '繼續執行' : '執行任務' }}
      </n-button>
    </div>
  </n-card>
</template>

<style scoped>
.task-card {
  border-radius: 12px;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.card-name {
  font-size: 16px;
  font-weight: 700;
}

.card-sub {
  font-size: 13px;
  color: #555b61;
}

.card-note {
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dot {
  margin: 0 2px;
  color: #b3b8be;
}

.card-action {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
