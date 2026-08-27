<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NEmpty, NSpin, NTab, NTabs, useMessage } from 'naive-ui'
import { useTaskStore } from '../stores/task'
import type { DueStatus, PendingTaskInfo } from '../types/database'
import TaskCard from '../components/task/TaskCard.vue'
import TaskRescheduleModal from '../components/task/TaskRescheduleModal.vue'

const store = useTaskStore()
const message = useMessage()

const tab = ref<'ALL' | DueStatus>('ALL')

const filtered = computed(() =>
  tab.value === 'ALL' ? store.pending : store.pending.filter((p) => p.dueStatus === tab.value),
)

const showReschedule = ref(false)
const rescheduleInfo = ref<PendingTaskInfo | null>(null)

async function execute(id: string) {
  try {
    await store.beginExecution(id)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '無法開始執行')
  }
}

function openReschedule(info: PendingTaskInfo) {
  rescheduleInfo.value = info
  showReschedule.value = true
}

async function refresh() {
  try {
    await store.loadPending()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">待執行任務</h1>
      <n-button size="small" secondary :loading="store.loading" @click="refresh">重新整理</n-button>
    </div>

    <n-tabs v-model:value="tab" type="segment" size="small" animated>
      <n-tab name="ALL">全部（{{ store.pending.length }}）</n-tab>
      <n-tab name="DUE_TODAY">今日（{{ store.todayCount }}）</n-tab>
      <n-tab name="UPCOMING">即將到來（{{ store.upcomingCount }}）</n-tab>
      <n-tab name="OVERDUE">逾期（{{ store.overdueCount }}）</n-tab>
    </n-tabs>

    <n-spin :show="store.loading" style="margin-top: 12px">
      <n-empty v-if="!filtered.length && !store.loading" description="目前沒有待執行任務 🎉" style="padding: 40px 0" />
      <div class="list">
        <task-card
          v-for="p in filtered"
          :key="p.assignment.id"
          :info="p"
          :loading="store.executing"
          :allow-reschedule="true"
          @execute="execute(p.assignment.id)"
          @reschedule="openReschedule(p)"
        />
      </div>
    </n-spin>

    <task-reschedule-modal
      v-model:show="showReschedule"
      :info="rescheduleInfo"
      @saved="refresh"
    />
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

</style>
