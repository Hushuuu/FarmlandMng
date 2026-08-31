<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  NButton,
  NCard,
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
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  assignmentService,
  getTargetNameMap,
  hardDeleteAssignment,
  hardDeleteTask,
  taskCrudService,
} from '../services/taskService'
import { areaService, orchardService } from '../services/orchardService'
import { treeService } from '../services/treeService'
import type {
  Area,
  Orchard,
  RecurrenceUnit,
  TargetType,
  Task,
  TaskAssignment,
  Tree,
} from '../types/database'
import { RECURRENCE_UNIT_OPTIONS, TARGET_TYPE_LABEL, recurrenceText } from '../constants/status'
import { formatDate } from '../utils/date'
import { genCode } from '../utils/code'
import { useMasterStore } from '../stores/tree'
import { useManagementStore } from '../stores/management'

const message = useMessage()
const dialog = useDialog()
const masterStore = useMasterStore()
const management = useManagementStore()

const loading = ref(true)
const tasks = ref<(Task & { assignments: TaskAssignment[] })[]>([])
const targetNames = ref(new Map<string, string>())
const orchards = ref<Orchard[]>([])

// ------------------------------------------------------------
// 任務 CRUD
// ------------------------------------------------------------
const showTaskForm = ref(false)
const editingTask = ref<Task | null>(null)
const saving = ref(false)
const taskForm = ref({ code: '', name: '', category_id: null as string | null, description: '', active: true })

function openTaskCreate() {
  editingTask.value = null
  taskForm.value = { code: '', name: '', category_id: masterStore.taskCategories[0]?.id ?? null, description: '', active: true }
  showTaskForm.value = true
}

function openTaskEdit(t: Task) {
  editingTask.value = t
  taskForm.value = {
    code: t.code,
    name: t.name,
    category_id: t.category_id,
    description: t.description ?? '',
    active: t.active,
  }
  showTaskForm.value = true
}

async function saveTask() {
  if (!taskForm.value.name) {
    message.warning('請填寫任務名稱')
    return
  }
  saving.value = true
  try {
    if (editingTask.value) {
      const { code: _ignored, ...rest } = taskForm.value
      await taskCrudService.update(editingTask.value.id, { ...rest })
      message.success('已更新任務')
    } else {
      await taskCrudService.create({ ...taskForm.value, code: genCode('TK') })
      message.success('已新增任務')
    }
    showTaskForm.value = false
    await reload()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

function confirmDeleteTask(t: Task) {
  dialog.warning({
    title: '停用任務',
    content: `確定停用「${t.name}」？其排程將不再產生待執行項目（歷史紀錄保留）。`,
    positiveText: '停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      await taskCrudService.softDelete(t.id)
      message.success('已停用')
      await reload()
    },
  })
}

function confirmHardDeleteTask(t: Task) {
  dialog.error({
    title: '永久刪除任務',
    content: `將永久刪除「${t.name}」及其所有排程、執行批次與歷史明細，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await hardDeleteTask(t.id)
        message.success('任務及相關資料已永久刪除')
        await reload()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

async function toggleTaskActive(t: Task, v: boolean) {
  await taskCrudService.update(t.id, { active: v })
  t.active = v
}

function categoryName(id: string | null): string {
  if (!id) return ''
  return masterStore.taskCategories.find((c) => c.id === id)?.name ?? ''
}

// ------------------------------------------------------------
// 任務排程（Assignment）
// ------------------------------------------------------------
const showAssignForm = ref(false)
const editingAssign = ref<TaskAssignment | null>(null)
const assignTaskId = ref<string | null>(null)
const assignForm = ref({
  target_type: 'AREA' as TargetType,
  orchard_id: null as string | null,
  area_id: null as string | null,
  tree_id: null as string | null,
  start_date: Date.now() as number,
  next_start_date: null as number | null,
  has_recurrence: true,
  recurrence_value: 30,
  recurrence_unit: 'DAY' as RecurrenceUnit,
  note: '',
  active: true,
})

const areas = ref<Area[]>([])
const trees = ref<Tree[]>([])

watch(
  () => assignForm.value.has_recurrence,
  (hasRecurrence) => {
    if (!hasRecurrence) assignForm.value.next_start_date = null
  },
)

watch(
  () => assignForm.value.orchard_id,
  async (id) => {
    areas.value = id ? await areaService.listByOrchard(id) : []
    if (!areas.value.some((a) => a.id === assignForm.value.area_id)) assignForm.value.area_id = null
  },
)

watch(
  () => assignForm.value.area_id,
  async (id) => {
    trees.value = id ? await treeService.listByArea(id) : []
    if (!trees.value.some((t) => t.id === assignForm.value.tree_id)) assignForm.value.tree_id = null
  },
)

function openAssignCreate(task: Task & { assignments: TaskAssignment[] }) {
  editingAssign.value = null
  assignTaskId.value = task.id
  assignForm.value = {
    target_type: 'AREA',
    orchard_id: orchards.value[0]?.id ?? null,
    area_id: null,
    tree_id: null,
    start_date: Date.now(),
    next_start_date: null,
    has_recurrence: true,
    recurrence_value: 30,
    recurrence_unit: 'DAY',
    note: '',
    active: true,
  }
  areas.value = []
  trees.value = []
  showAssignForm.value = true
}

async function openAssignEdit(a: TaskAssignment) {
  editingAssign.value = a
  assignTaskId.value = a.task_id
  let orchardId: string | null = null
  let areaId: string | null = null
  if (a.target_type === 'ORCHARD') orchardId = a.target_id
  else if (a.target_type === 'AREA') {
    const ar = await areaService.get(a.target_id)
    areaId = a.target_id
    orchardId = ar?.orchard_id ?? null
  } else {
    const tr = await treeService.get(a.target_id)
    if (tr) {
      const ar = await areaService.get(tr.area_id)
      areaId = tr.area_id
      orchardId = ar?.orchard_id ?? null
    }
  }
  const hasRecurrence = !!a.recurrence_value && !!a.recurrence_unit
  assignForm.value = {
    target_type: a.target_type,
    orchard_id: orchardId,
    area_id: areaId,
    tree_id: a.target_type === 'TREE' ? a.target_id : null,
    start_date: new Date(`${a.start_date}T00:00:00`).getTime(),
    next_start_date:
      hasRecurrence && a.next_start_date ? new Date(`${a.next_start_date}T00:00:00`).getTime() : null,
    has_recurrence: hasRecurrence,
    recurrence_value: a.recurrence_value ?? 30,
    recurrence_unit: a.recurrence_unit ?? 'DAY',
    note: a.note ?? '',
    active: a.active,
  }
  // 觸發 watch 載入下拉選項
  if (orchardId) areas.value = await areaService.listByOrchard(orchardId)
  if (areaId) trees.value = await treeService.listByArea(areaId)
  showAssignForm.value = true
}

async function saveAssign() {
  const f = assignForm.value
  let targetId: string | null = null
  if (f.target_type === 'ORCHARD') targetId = f.orchard_id
  else if (f.target_type === 'AREA') targetId = f.area_id
  else targetId = f.tree_id
  if (!targetId) {
    message.warning('請選擇指定對象')
    return
  }
  if (f.has_recurrence && f.recurrence_value <= 0) {
    message.warning('週期天數必須大於 0')
    return
  }
  const d = new Date(f.start_date)
  const nextDate = f.next_start_date ? new Date(f.next_start_date) : null
  const payload = {
    task_id: assignTaskId.value!,
    target_type: f.target_type,
    target_id: targetId,
    start_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    next_start_date: f.has_recurrence && nextDate
      ? `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`
      : null,
    recurrence_value: f.has_recurrence ? f.recurrence_value : null,
    recurrence_unit: f.has_recurrence ? f.recurrence_unit : null,
    note: f.note || null,
    active: f.active,
  }
  saving.value = true
  try {
    if (editingAssign.value) {
      await assignmentService.update(editingAssign.value.id, payload)
      message.success('已更新排程')
    } else {
      await assignmentService.create(payload)
      message.success('已新增排程')
    }
    showAssignForm.value = false
    await reload()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

async function confirmDeleteAssign(a: TaskAssignment) {
  dialog.warning({
    title: '刪除排程',
    content: '確定停用此排程？未來將不再產生此任務的執行項目。',
    positiveText: '停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      await assignmentService.softDelete(a.id)
      message.success('已停用')
      await reload()
    },
  })
}

function confirmHardDeleteAssign(a: TaskAssignment, taskName: string) {
  dialog.error({
    title: '永久刪除排程',
    content: `將永久刪除「${taskName}」的此筆排程、執行批次與歷史明細，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await hardDeleteAssignment(a.id)
        message.success('排程及相關資料已永久刪除')
        await reload()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

async function toggleAssignActive(a: TaskAssignment, v: boolean) {
  await assignmentService.update(a.id, { active: v })
  a.active = v
}

// ------------------------------------------------------------
async function reload() {
  tasks.value = []
  const list = await taskCrudService.list(true)
  tasks.value = await Promise.all(list.map(async (t) => ({ ...t, assignments: await assignmentService.listByTask(t.id) })))
  targetNames.value = await getTargetNameMap(tasks.value.flatMap((t) => t.assignments))
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([reload(), masterStore.loadAll(), orchardService.list().then((o) => (orchards.value = o))])
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">任務設定</h1>
      <n-button type="primary" size="small" @click="openTaskCreate">＋ 新增任務</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!tasks.length && !loading" description="尚未建立任何任務" style="padding: 40px 0" />

      <div class="task-list">
        <n-card v-for="t in tasks" :key="t.id" size="small" class="task-item" :class="{ inactive: !t.active }">
          <div class="row-main">
            <div class="info">
              <div class="name">
                {{ t.name }}
                <n-tag v-if="categoryName(t.category_id)" size="tiny" :bordered="false" type="success">{{ categoryName(t.category_id) }}</n-tag>
                <n-tag v-if="!t.active" size="tiny" type="error" round>已停用</n-tag>
              </div>
              <div v-if="t.description" class="muted">{{ t.description }}</div>

              <div class="assign-list">
                <div v-for="a in t.assignments" :key="a.id" class="assign-row">
                  <div class="assign-info">
                    <n-tag size="tiny" :type="a.active ? 'info' : 'default'" round>
                      {{ TARGET_TYPE_LABEL[a.target_type] }}
                    </n-tag>
                    <b>{{ targetNames.get(a.id) ?? '…' }}</b>
                    <span class="muted">　{{ recurrenceText(a.recurrence_value, a.recurrence_unit) }}　起始 {{ formatDate(a.start_date) }}</span>
                    <span v-if="a.next_start_date && a.recurrence_value && a.recurrence_unit" class="muted">
                     　下一輪 {{ formatDate(a.next_start_date) }}
                    </span>
                    <span v-if="a.note" class="assign-note muted">　指派備註：{{ a.note }}</span>
                    <n-tag v-if="!a.active" size="tiny" type="error" round>已停用</n-tag>
                  </div>
                  <div class="row-actions">
                    <n-switch size="small" :value="a.active" @update:value="(v: boolean) => toggleAssignActive(a, v)" />
                    <n-button size="tiny" quaternary @click="openAssignEdit(a)">編輯</n-button>
                    <n-button v-if="a.active" size="tiny" quaternary type="error" @click="confirmDeleteAssign(a)">停用</n-button>
                    <n-button
                      v-if="management.unlocked"
                      size="tiny"
                      quaternary
                      type="error"
                      @click="confirmHardDeleteAssign(a, t.name)"
                    >
                      永久刪除
                    </n-button>
                  </div>
                </div>
                <div v-if="!t.assignments.length" class="muted assign-empty">
                  尚未指派對象 — 點下方「指派對象與週期」，選擇果園／區域／單棵果樹
                </div>
              </div>
            </div>
            <div class="row-actions top">
              <n-switch size="small" :value="t.active" @update:value="(v: boolean) => toggleTaskActive(t, v)" />
              <n-button size="tiny" quaternary @click="openTaskEdit(t)">編輯</n-button>
              <n-button v-if="t.active" size="tiny" quaternary type="error" @click="confirmDeleteTask(t)">停用</n-button>
              <n-button
                v-if="management.unlocked"
                size="tiny"
                quaternary
                type="error"
                @click="confirmHardDeleteTask(t)"
              >
                永久刪除
              </n-button>
            </div>
          </div>

          <div style="margin-top: 10px; text-align: right">
            <n-button size="small" type="primary" @click="openAssignCreate(t)">＋ 指派對象與週期</n-button>
          </div>
        </n-card>
      </div>
    </n-spin>

    <!-- 任務表單 -->
    <n-modal v-model:show="showTaskForm" preset="card" :title="editingTask ? '編輯任務' : '新增任務'" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="任務名稱" required>
          <n-input v-model:value="taskForm.name" placeholder="例如：A 區施肥" />
        </n-form-item>
        <n-form-item label="任務類別">
          <n-select v-model:value="taskForm.category_id" :options="masterStore.categoryOptions" clearable />
        </n-form-item>
        <n-form-item label="說明">
          <n-input v-model:value="taskForm.description" type="textarea" :rows="2" />
        </n-form-item>
        <n-form-item label="啟用">
          <n-switch v-model:value="taskForm.active" />
        </n-form-item>
        <n-button block type="primary" :loading="saving" @click="saveTask">儲存</n-button>
      </n-form>
    </n-modal>

    <!-- 排程表單 -->
    <n-modal v-model:show="showAssignForm" preset="card" title="任務排程" style="max-width: 420px">
      <n-form label-placement="top">
        <n-form-item label="指定對象類型" required>
          <n-select
            v-model:value="assignForm.target_type"
            :options="(Object.keys(TARGET_TYPE_LABEL) as TargetType[]).map((k) => ({ label: TARGET_TYPE_LABEL[k], value: k }))"
          />
        </n-form-item>
        <n-form-item label="果園">
          <n-select
            v-model:value="assignForm.orchard_id"
            :options="orchards.map((o) => ({ label: o.name, value: o.id }))"
            placeholder="選擇果園"
            filterable
          />
        </n-form-item>
        <n-form-item v-if="assignForm.target_type !== 'ORCHARD'" label="區域">
          <n-select
            v-model:value="assignForm.area_id"
            :options="areas.map((a) => ({ label: a.name, value: a.id }))"
            placeholder="選擇區域（等同區域內全部果樹）"
            filterable
          />
        </n-form-item>
        <n-form-item v-if="assignForm.target_type === 'TREE'" label="果樹">
          <n-select
            v-model:value="assignForm.tree_id"
            :options="trees.map((t) => ({ label: `${t.name || ''} ${t.code}`, value: t.id }))"
            placeholder="選擇單一棵果樹"
            filterable
          />
        </n-form-item>
        <n-form-item v-if="assignForm.target_type === 'AREA'" :show-feedback="false">
          <div class="muted">指定區域＝執行時解析「當下」區域內所有有效果樹，之後新增的樹也會自動納入</div>
        </n-form-item>

        <n-form-item label="開始日期" required>
          <n-date-picker v-model:value="assignForm.start_date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item v-if="assignForm.has_recurrence" label="下一輪預計開始日">
          <n-date-picker v-model:value="assignForm.next_start_date" type="date" clearable style="width: 100%" />
          <div class="muted">完成本輪後會自動依週期帶入，也可以在待執行任務中調整。</div>
        </n-form-item>

        <n-form-item label="重複週期">
          <div class="recurrence-row">
            <n-switch v-model:value="assignForm.has_recurrence" />
            <template v-if="assignForm.has_recurrence">
              <span>每</span>
              <n-input-number v-model:value="assignForm.recurrence_value" :min="1" :max="365" style="width: 90px" />
              <n-select v-model:value="assignForm.recurrence_unit" :options="RECURRENCE_UNIT_OPTIONS" style="width: 90px" />
            </template>
            <span v-else class="muted">關閉表示單次任務</span>
          </div>
        </n-form-item>

        <n-form-item label="指派備註">
          <n-input v-model:value="assignForm.note" type="textarea" :rows="2" />
        </n-form-item>
        <n-form-item label="啟用">
          <n-switch v-model:value="assignForm.active" />
        </n-form-item>
        <n-button block type="primary" :loading="saving" @click="saveAssign">儲存</n-button>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-item.inactive {
  opacity: 0.65;
}

.row-main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.row-actions.top {
  align-items: flex-start;
}

.assign-list {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assign-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 6px 10px;
}

.assign-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
}

.assign-note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.recurrence-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
