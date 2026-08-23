<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NDatePicker,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpin,
  NSwitch,
  useMessage,
} from 'naive-ui'
import { assignmentService, taskCrudService } from '../../services/taskService'
import { RECURRENCE_UNIT_OPTIONS, TARGET_TYPE_LABEL } from '../../constants/status'
import type { RecurrenceUnit, TargetType, Task } from '../../types/database'

const props = defineProps<{
  show: boolean
  targetType: TargetType
  targetId: string | null
  targetLabel?: string
}>()

const emit = defineEmits<{ 'update:show': [boolean]; created: [] }>()

const router = useRouter()
const message = useMessage()

const tasks = ref<Task[]>([])
const loading = ref(false)
const saving = ref(false)
const taskId = ref<string | null>(null)
const startDate = ref<number>(Date.now())
const hasRecurrence = ref(true)
const recurrenceValue = ref(30)
const recurrenceUnit = ref<RecurrenceUnit>('DAY')
const note = ref('')

watch(
  () => props.show,
  async (s) => {
    if (!s) return
    taskId.value = null
    note.value = ''
    loading.value = true
    try {
      tasks.value = await taskCrudService.list()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '載入任務失敗')
    } finally {
      loading.value = false
    }
  },
)

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function submit() {
  if (!taskId.value) {
    message.warning('請選擇任務')
    return
  }
  if (!props.targetId) return
  if (hasRecurrence.value && recurrenceValue.value <= 0) {
    message.warning('週期必須大於 0')
    return
  }
  saving.value = true
  try {
    await assignmentService.create({
      task_id: taskId.value,
      target_type: props.targetType,
      target_id: props.targetId,
      start_date: fmtDate(startDate.value),
      recurrence_value: hasRecurrence.value ? recurrenceValue.value : null,
      recurrence_unit: hasRecurrence.value ? recurrenceUnit.value : null,
      note: note.value || null,
      active: true,
    })
    message.success(`已指派任務到「${props.targetLabel ?? ''}」`)
    emit('update:show', false)
    emit('created')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '指派失敗')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="指派任務"
    style="max-width: 420px"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <n-spin :show="loading">
      <div class="target-line muted">對象：{{ TARGET_TYPE_LABEL[targetType] }} · {{ targetLabel }}</div>

      <template v-if="!tasks.length && !loading">
        <n-empty description="還沒有任何任務，先建立一個吧" style="padding: 24px 0">
          <template #extra>
            <n-button size="small" type="primary" @click="router.push('/tasks')">前往任務設定</n-button>
          </template>
        </n-empty>
      </template>

      <n-form v-else label-placement="top">
        <n-form-item label="選擇任務" required>
          <n-select
            v-model:value="taskId"
            :options="tasks.map((t) => ({ label: t.name, value: t.id }))"
            placeholder="例如：施肥、澆水…"
            filterable
          />
        </n-form-item>
        <n-form-item label="開始日期">
          <n-date-picker v-model:value="startDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="重複週期">
          <div class="rec-row">
            <n-switch v-model:value="hasRecurrence" />
            <template v-if="hasRecurrence">
              <span>每</span>
              <n-input-number v-model:value="recurrenceValue" :min="1" :max="365" style="width: 88px" />
              <n-select v-model:value="recurrenceUnit" :options="RECURRENCE_UNIT_OPTIONS" style="width: 92px" />
            </template>
            <span v-else class="muted">關閉表示單次任務</span>
          </div>
        </n-form-item>
        <n-form-item label="備註">
          <n-input v-model:value="note" type="textarea" :rows="2" placeholder="選填" />
        </n-form-item>
        <n-button block type="primary" :loading="saving" @click="submit">指派</n-button>
      </n-form>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.target-line {
  margin-bottom: 12px;
  font-size: 13px;
}

.rec-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
