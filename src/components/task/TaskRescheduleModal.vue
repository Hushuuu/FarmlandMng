<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NDatePicker, NForm, NFormItem, NModal, useMessage } from 'naive-ui'
import { assignmentService, updateBatchScheduledDate } from '../../services/taskService'
import type { PendingTaskInfo } from '../../types/database'
import { parseDate, todayStr, toDateStr } from '../../utils/date'

const props = defineProps<{
  show: boolean
  info: PendingTaskInfo | null
}>()

const emit = defineEmits<{
  'update:show': [boolean]
  saved: []
}>()

const message = useMessage()
const date = ref<number | null>(null)
const saving = ref(false)
const runningRound = computed(() => !!props.info?.runningBatchId)
const overdueRound = computed(
  () => !runningRound.value && props.info?.dueStatus === 'OVERDUE',
)
const nextRound = computed(
  () =>
    !runningRound.value &&
    !overdueRound.value &&
    !!props.info?.assignment.recurrence_value &&
    !!props.info?.assignment.recurrence_unit,
)
const modalTitle = computed(() =>
  runningRound.value
    ? '調整本輪執行日期'
    : overdueRound.value
      ? '展延本輪預計日期'
      : nextRound.value
        ? '調整下一輪預計開始日'
        : '調整單次任務日期',
)
const dateLabel = computed(() =>
  runningRound.value
    ? '本輪執行日期'
    : overdueRound.value
      ? '本輪預計日期'
      : nextRound.value
        ? '下一輪預計開始日'
        : '預計執行日期',
)

watch(
  () => [props.show, props.info] as const,
  ([show, info]) => {
    if (!show || !info) return
    date.value = info.dueDate ? parseDate(info.dueDate).getTime() : Date.now()
  },
  { immediate: true },
)

async function save() {
  const info = props.info
  if (!info) return

  const selectedDate = date.value === null ? null : toDateStr(new Date(date.value))
  if (runningRound.value) {
    if (!selectedDate) {
      message.warning('本輪執行日期不可清除')
      return
    }
  } else if (overdueRound.value && selectedDate && selectedDate < todayStr()) {
    message.warning('展延日期需為今天或之後')
    return
  } else if (nextRound.value && selectedDate && info.lastCompletedDate && selectedDate <= info.lastCompletedDate) {
    message.warning(`下一輪預計開始日需晚於上次結算日（${info.lastCompletedDate}）`)
    return
  }

  saving.value = true
  try {
    if (runningRound.value) {
      await updateBatchScheduledDate(info.runningBatchId!, selectedDate!)
    } else {
      await assignmentService.update(info.assignment.id, { next_start_date: selectedDate })
    }
    emit('update:show', false)
    emit('saved')
    message.success(
      runningRound.value
        ? '本輪執行日期已更新'
        : overdueRound.value
          ? '本輪預計日期已展延'
          : nextRound.value
            ? '下一輪預計開始日已更新'
            : '單次任務預計日期已更新',
    )
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新日期失敗')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="modalTitle"
    style="max-width: 400px"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div v-if="info" class="target muted">
      {{ info.task.name }} · {{ info.targetPath }}
    </div>
    <div v-if="info?.assignment.note" class="assignment-note muted">
      備註：{{ info.assignment.note }}
    </div>
    <n-form label-placement="top">
      <n-form-item :label="dateLabel" :required="runningRound">
        <n-date-picker v-model:value="date" type="date" :clearable="!runningRound" style="width: 100%" />
      </n-form-item>
      <div v-if="runningRound" class="muted hint">
        只會調整目前進行中批次的日期，不會變更下一輪排程。
      </div>
      <div v-else-if="overdueRound" class="muted hint">
        這是目前尚未開始的本輪任務；展延日期需為今天或之後。
      </div>
      <div v-else-if="nextRound && info?.lastCompletedDate" class="muted hint">
        上次結算：{{ info.lastCompletedDate }}；下一輪不可排在同一天。
      </div>
      <div v-else-if="!nextRound" class="muted hint">
        單次任務只會調整本次預計執行日期，完成後不會建立下一輪。
      </div>
      <n-button block type="primary" :loading="saving" @click="save">儲存</n-button>
    </n-form>
  </n-modal>
</template>

<style scoped>
.target {
  margin-bottom: 12px;
}

.assignment-note {
  margin: -4px 0 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.hint {
  margin: -4px 0 12px;
  font-size: 12px;
}
</style>
