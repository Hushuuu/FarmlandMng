<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { useOrchardStore } from '../stores/orchard'
import { genCode } from '../utils/code'
import type { BatchSummary, Orchard, PendingTaskInfo } from '../types/database'
import { useManagementStore } from '../stores/management'
import { statsService } from '../services/statsService'
import type { AreaStats } from '../services/statsService'
import { getPendingTasks, listBatchSummaries } from '../services/taskService'
import DueStatusTag from '../components/task/DueStatusTag.vue'
import { useTaskStore } from '../stores/task'

const router = useRouter()
const store = useOrchardStore()
const message = useMessage()
const dialog = useDialog()
const management = useManagementStore()
const taskStore = useTaskStore()

const showForm = ref(false)
const editing = ref<Orchard | null>(null)
const saving = ref(false)
const form = ref({
  code: '',
  name: '',
  description: '',
  map_width: 2000,
  map_height: 1200,
})

function openCreate() {
  editing.value = null
  form.value = { code: '', name: '', description: '', map_width: 2000, map_height: 1200 }
  showForm.value = true
}

function openEdit(o: Orchard) {
  editing.value = o
  form.value = {
    code: o.code,
    name: o.name,
    description: o.description ?? '',
    map_width: Number(o.map_width),
    map_height: Number(o.map_height),
  }
  showForm.value = true
}

async function save() {
  if (!form.value.name) {
    message.warning('請填寫果園名稱')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      const { code: _ignored, ...rest } = form.value
      await store.updateOrchard(editing.value.id, { ...rest })
      message.success('已更新')
    } else {
      await store.createOrchard({ ...form.value, code: genCode('ORCH'), active: true })
      message.success('已建立果園')
    }
    showForm.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

function confirmDelete(o: Orchard) {
  dialog.warning({
    title: '停用果園',
    content: `確定停用「${o.name}」？停用後不會顯示於列表（軟刪除，歷史資料保留）。`,
    positiveText: '停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      await store.softDeleteOrchard(o.id)
      message.success('已停用')
    },
  })
}

function confirmHardDelete(o: Orchard) {
  dialog.error({
    title: '永久刪除果園',
    content: `將永久刪除「${o.name}」及其區域、果樹、任務排程與執行歷史，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.hardDeleteOrchard(o.id)
        message.success('果園及相關資料已永久刪除')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

/** 果園狀況抽屜（參考 Dashboard openOrchardDetail） */
const showDetail = ref(false)
const detailLoading = ref(false)
const selected = ref<Orchard | null>(null)
const areaList = ref<AreaStats[]>([])
const pending = ref<PendingTaskInfo[]>([])
const history = ref<BatchSummary[]>([])

async function openDetail(o: Orchard) {
  selected.value = o
  showDetail.value = true
  await loadDetail()
}

async function loadDetail() {
  if (!selected.value) return
  detailLoading.value = true
  try {
    const [ars, pt, hs] = await Promise.all([statsService.areaStats(), getPendingTasks(), listBatchSummaries()])
    areaList.value = ars
    pending.value = pt
    history.value = hs
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入狀況失敗')
  } finally {
    detailLoading.value = false
  }
}

const selectedAreas = computed(() =>
  selected.value ? areaList.value.filter((a) => a.area.orchard_id === selected.value!.id) : [],
)

const selectedAreaTreeTotal = computed(() => selectedAreas.value.reduce((sum, a) => sum + a.treeCount, 0))

const selectedOrchardTasks = computed(() =>
  selected.value
    ? pending.value.filter(
        (p) => p.orchardId === selected.value!.id && p.assignment.target_type === 'ORCHARD',
      )
    : [],
)

function orchardSettledCount(orchardId: string): number {
  return history.value.filter(
    (b) => b.status === 'COMPLETED' && b.orchardId === orchardId && b.targetType === 'ORCHARD',
  ).length
}

function areaTasks(orchardId: string, areaId: string): PendingTaskInfo[] {
  return pending.value.filter((p) => p.orchardId === orchardId && p.areaId === areaId)
}

function areaTaskCounts(orchardId: string, areaId: string) {
  const list = areaTasks(orchardId, areaId)
  return {
    total: list.length,
    today: list.filter((p) => p.dueStatus === 'DUE_TODAY').length,
    upcoming: list.filter((p) => p.dueStatus === 'UPCOMING').length,
    overdue: list.filter((p) => p.dueStatus === 'OVERDUE').length,
    running: list.filter((p) => !!p.runningBatchId).length,
  }
}

function settledCount(orchardId: string, areaId: string): number {
  return history.value.filter(
    (b) => b.status === 'COMPLETED' && b.orchardId === orchardId && b.areaId === areaId,
  ).length
}

async function execute(p: PendingTaskInfo) {
  try {
    await taskStore.beginExecution(p.assignment.id)
    await loadDetail()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '無法開始執行')
  }
}

onMounted(() => store.loadOrchards(true))
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">果園列表</h1>
      <n-button type="primary" size="small" @click="openCreate">＋ 新增果園</n-button>
    </div>

    <n-spin :show="store.loading">
      <n-empty v-if="!store.orchards.length && !store.loading" description="還沒有果園" style="padding: 40px 0" />
      <div class="orchard-list">
        <n-card v-for="o in store.orchards" :key="o.id" size="small" class="orchard-item">
          <div class="row-main clickable" @click="router.push(`/orchards/${o.id}/map`)">
            <div>
              <div class="name">
                {{ o.name }}
                <n-tag v-if="!o.active" size="tiny" type="error" round>已停用</n-tag>
              </div>
              <!-- <div class="muted">地圖 {{ o.map_width }} × {{ o.map_height }}</div> -->
              <div v-if="o.description" class="muted desc">{{ o.description }}</div>
            </div>
            <div>
              <n-button size="small" secondary @click.stop="openDetail(o)">查看狀況</n-button>
              <n-button size="small" secondary type="primary" @click.stop="router.push(`/orchards/${o.id}/map`)">
                地圖 →
              </n-button>
            </div>
          </div>
          <div class="row-actions">
            <n-button size="tiny" quaternary @click.stop="openEdit(o)">編輯</n-button>
            <n-button v-if="o.active" size="tiny" quaternary type="error" @click.stop="confirmDelete(o)">停用</n-button>
            <n-button
              v-if="management.unlocked"
              size="tiny"
              quaternary
              type="error"
              @click.stop="confirmHardDelete(o)"
            >
              永久刪除
            </n-button>
          </div>
        </n-card>
      </div>
    </n-spin>

    <n-modal v-model:show="showForm" preset="card" :title="editing ? '編輯果園' : '新增果園'" style="max-width: 420px">
      <n-form label-placement="top">
        <n-form-item label="名稱" required>
          <n-input v-model:value="form.name" placeholder="例如：一號果園" />
        </n-form-item>
        <n-form-item label="說明">
          <n-input v-model:value="form.description" type="textarea" :rows="2" placeholder="選填" />
        </n-form-item>
        <div class="size-row">
          <n-form-item label="地圖寬度">
            <n-input-number v-model:value="form.map_width" :min="200" :max="20000" :step="100" style="width: 100%" />
          </n-form-item>
          <n-form-item label="地圖高度">
            <n-input-number v-model:value="form.map_height" :min="200" :max="20000" :step="100" />
          </n-form-item>
        </div>
        <n-button block type="primary" :loading="saving" @click="save">儲存</n-button>
      </n-form>
    </n-modal>

    <n-drawer v-model:show="showDetail" placement="right" :width="420">
      <n-drawer-content v-if="selected" :title="selected.name" closable>
        <n-spin :show="detailLoading">
          <div class="detail-head">
            <div class="muted">
              {{ selectedAreas.length }} 個區域 · {{ selectedAreaTreeTotal }} 棵果樹
            </div>
            <n-button size="small" secondary type="primary" @click="router.push(`/orchards/${selected.id}/map`)">
              進入地圖
            </n-button>
          </div>

          <n-card
            v-if="selectedOrchardTasks.length || orchardSettledCount(selected.id)"
            size="small"
            class="orchard-task-card"
          >
            <div class="area-detail-head">
              <div>
                <div class="area-detail-name">果園任務</div>
              </div>
              <span class="settled">已結算 {{ orchardSettledCount(selected.id) }} 次</span>
            </div>
            <div v-if="selectedOrchardTasks.length" class="area-task-list">
              <div v-for="task in selectedOrchardTasks" :key="task.assignment.id" class="area-task-row">
                <div class="area-task-name">{{ task.task.name }}</div>
                <due-status-tag :status="task.dueStatus" />
                <n-tag v-if="task.runningBatchId" size="tiny" type="info" round>執行中</n-tag>
                <n-button size="tiny" type="primary" @click="execute(task)">
                  {{ task.runningBatchId ? '繼續' : '執行' }}
                </n-button>
              </div>
            </div>
            <div v-else class="muted area-task-empty">目前沒有待執行的果園層級任務</div>
          </n-card>

          <n-empty v-if="!selectedAreas.length && !detailLoading" description="目前沒有有效區域" style="padding: 24px 0" />
          <div v-else-if="selectedAreas.length" class="area-detail-list">
            <n-card v-for="area in selectedAreas" :key="area.area.id" size="small" class="area-detail-card">
              <div class="area-detail-head">
                <div>
                  <div class="area-detail-name">{{ area.area.name }}</div>
                  <div class="muted">{{ area.treeCount }} 棵果樹</div>
                </div>
                <n-tag v-if="areaTaskCounts(selected.id, area.area.id).overdue" size="tiny" type="error" round>
                  逾期 {{ areaTaskCounts(selected.id, area.area.id).overdue }}
                </n-tag>
              </div>

              <div class="area-detail-stats">
                <span>任務 {{ areaTaskCounts(selected.id, area.area.id).total }}</span>
                <span class="warn">今日 {{ areaTaskCounts(selected.id, area.area.id).today }}</span>
                <span class="info">執行中 {{ areaTaskCounts(selected.id, area.area.id).running }}</span>
                <span class="settled">已結算 {{ settledCount(selected.id, area.area.id) }} 次</span>
              </div>

              <div v-if="areaTasks(selected.id, area.area.id).length" class="area-task-list">
                <div
                  v-for="task in areaTasks(selected.id, area.area.id)"
                  :key="task.assignment.id"
                  class="area-task-row"
                >
                  <div class="area-task-name">
                    {{ task.task.name }}
                    <span class="muted">· {{ task.targetLabel }}</span>
                  </div>
                  <due-status-tag :status="task.dueStatus" />
                  <n-tag v-if="task.runningBatchId" size="tiny" type="info" round>執行中</n-tag>
                  <n-button size="tiny" type="primary" @click="execute(task)">
                    {{ task.runningBatchId ? '繼續' : '執行' }}
                  </n-button>
                </div>
              </div>
              <div v-else class="muted area-task-empty">尚未指派任務</div>
            </n-card>
          </div>
        </n-spin>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.orchard-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}

.desc {
  margin-top: 2px;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin-top: 6px;
}

.size-row {
  display: flex;
  gap: 10px;
}

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

.area-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
}

.area-detail-stats .info {
  color: #2080f0;
}

.area-detail-stats .settled {
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
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.area-task-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.area-task-empty {
  margin-top: 8px;
  font-size: 12px;
}

.warn {
  color: #f0a020;
}
</style>
