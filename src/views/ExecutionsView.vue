<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NEmpty, NProgress, NSpin, NTag } from 'naive-ui'
import { listBatchSummaries } from '../services/taskService'
import type { BatchSummary } from '../types/database'
import { BATCH_STATUS_META } from '../constants/status'
import { formatDateWithWeekday } from '../utils/date'

const router = useRouter()
const loading = ref(true)
const batches = ref<BatchSummary[]>([])

const tab = ref<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('ALL')

const filtered = computed(() => {
  if (tab.value === 'ALL') return batches.value
  return batches.value.filter((b) => b.status === tab.value)
})

function percent(b: BatchSummary): number {
  return b.totalItems ? Math.round((b.completedItems / b.totalItems) * 100) : 0
}

onMounted(async () => {
  try {
    batches.value = await listBatchSummaries()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">執行紀錄</h1>
      <n-button size="small" secondary :loading="loading" @click="async () => { loading = true; try { batches = await listBatchSummaries() } finally { loading = false } }">
        重新整理
      </n-button>
    </div>

    <n-tabs v-model:value="tab" type="segment" size="small">
      <n-tab name="ALL">全部</n-tab>
      <n-tab name="IN_PROGRESS">執行中</n-tab>
      <n-tab name="COMPLETED">已完成</n-tab>
    </n-tabs>

    <n-spin :show="loading" style="margin-top: 12px">
      <n-empty v-if="!filtered.length && !loading" description="尚無執行紀錄" style="padding: 40px 0" />
      <div class="list">
        <n-card v-for="b in filtered" :key="b.id" size="small" class="clickable" @click="router.push('/tasks/history')">
          <div class="row-top">
            <div>
              <div class="name">{{ b.taskName }} <span class="muted">{{ b.targetLabel }}</span></div>
              <div class="muted">{{ formatDateWithWeekday(b.scheduled_date) }}</div>
            </div>
            <n-tag size="small" :type="BATCH_STATUS_META[b.status].type" round>
              {{ BATCH_STATUS_META[b.status].label }}
            </n-tag>
          </div>
          <div class="progress-row">
            <n-progress
              type="line"
              :percentage="percent(b)"
              :height="8"
              :border-radius="4"
              color="#18a058"
              :show-indicator="false"
            />
            <span class="count muted">{{ b.completedItems }} / {{ b.totalItems }}</span>
          </div>
          <div v-if="b.note" class="muted">{{ b.note }}</div>
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 15px;
  font-weight: 700;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.progress-row > :first-child {
  flex: 1;
}

.count {
  font-size: 12px;
}
</style>
