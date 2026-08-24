<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NDatePicker, NForm, NFormItem, NModal, useMessage } from 'naive-ui'
import { assignmentService } from '../../services/taskService'
import type { PendingTaskInfo } from '../../types/database'
import { parseDate, toDateStr } from '../../utils/date'

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

  const nextDate = date.value === null ? null : toDateStr(new Date(date.value))
  if (nextDate && info.lastCompletedDate && nextDate <= info.lastCompletedDate) {
    message.warning(`下一輪預計開始日需晚於上次結算日（${info.lastCompletedDate}）`)
    return
  }

  saving.value = true
  try {
    await assignmentService.update(info.assignment.id, { next_start_date: nextDate })
    emit('update:show', false)
    emit('saved')
    message.success('下一輪預計開始日已更新')
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
    title="調整下一輪預計開始日"
    style="max-width: 400px"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div v-if="info" class="target muted">
      {{ info.task.name }} · {{ info.targetPath }}
    </div>
    <n-form label-placement="top">
      <n-form-item label="下一輪預計開始日" required>
        <n-date-picker v-model:value="date" type="date" clearable style="width: 100%" />
      </n-form-item>
      <div v-if="info?.lastCompletedDate" class="muted hint">
        上次結算：{{ info.lastCompletedDate }}；下一輪不可排在同一天。
      </div>
      <n-button block type="primary" :loading="saving" @click="save">儲存</n-button>
    </n-form>
  </n-modal>
</template>

<style scoped>
.target {
  margin-bottom: 12px;
}

.hint {
  margin: -4px 0 12px;
  font-size: 12px;
}
</style>
