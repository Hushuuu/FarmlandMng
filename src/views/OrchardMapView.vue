<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NDrawer,
  NDrawerContent,
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
import MapCanvas from '../components/orchard/MapCanvas.vue'
import MapControls from '../components/orchard/MapControls.vue'
import MapToolbar from '../components/orchard/MapToolbar.vue'
import AreaMarker from '../components/orchard/AreaMarker.vue'
import QuickAssignModal from '../components/task/QuickAssignModal.vue'
import TaskRescheduleModal from '../components/task/TaskRescheduleModal.vue'
import DueStatusTag from '../components/task/DueStatusTag.vue'
import { orchardService } from '../services/orchardService'
import { treeService } from '../services/treeService'
import { getPendingTasks } from '../services/taskService'
import type { Orchard, PendingTaskInfo } from '../types/database'
import { TARGET_TYPE_LABEL } from '../constants/status'
import { formatDate } from '../utils/date'
import { genCode } from '../utils/code'
import { useAreaStore } from '../stores/orchard'
import { useTaskStore } from '../stores/task'
import { useMasterStore } from '../stores/tree'
import { useManagementStore } from '../stores/management'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const orchardId = route.params.orchardId as string
const areaStore = useAreaStore()
const taskStore = useTaskStore()
const masterStore = useMasterStore()
const management = useManagementStore()

const canvasRef = ref<InstanceType<typeof MapCanvas> | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const loading = ref(true)
const orchard = ref<Orchard | null>(null)
const editMode = ref(false)
const selectedId = ref<string | null>(null)
const showInfo = ref(false)
const showForm = ref(false)
const formTitle = ref('新增區域')
const saving = ref(false)

interface AreaTaskStat {
  treeCount: number
  typeLabel: string
  today: number
  upcoming: number
  overdue: number
}
const taskStats = reactive<Record<string, AreaTaskStat>>({})

function emptyStat(): AreaTaskStat {
  return { treeCount: 0, typeLabel: '', today: 0, upcoming: 0, overdue: 0 }
}

const mapWidth = computed(() => Number(orchard.value?.map_width ?? 2000))
const mapHeight = computed(() => Number(orchard.value?.map_height ?? 1200))

const selected = computed(() => areaStore.areas.find((a) => a.id === selectedId.value) ?? null)

function statOf(areaId: string): AreaTaskStat {
  return taskStats[areaId] ?? emptyStat()
}

function select(id: string | null) {
  selectedId.value = id
  showInfo.value = !!id && !editMode.value
}

async function persistPosition(areaId: string) {
  const a = areaStore.areas.find((x) => x.id === areaId)
  if (!a) return
  try {
    await areaStore.updateAreaPosition(areaId, a.position_x, a.position_y)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存位置失敗')
  }
}

// ------------------------------------------------------------
// 新增 / 編輯區域
// ------------------------------------------------------------
const form = ref({ code: '', name: '', description: '', width: 300, height: 220 })

function openCreate() {
  const c = canvasRef.value?.centerVirtual() ?? { x: 300, y: 300 }
  const w = 300
  const h = 220
  form.value = {
    code: '',
    name: '',
    description: '',
    width: w,
    height: h,
  }
  pendingCreatePos.value = {
    x: Math.max(10, c.x - w / 2),
    y: Math.max(10, c.y - h / 2),
  }
  formTitle.value = '新增區域（建立後可拖曳調整位置）'
  showForm.value = true
}

const pendingCreatePos = ref<{ x: number; y: number } | null>(null)

function openEditSelected() {
  if (!selected.value) return
  form.value = {
    code: selected.value.code,
    name: selected.value.name,
    description: selected.value.description ?? '',
    width: Number(selected.value.width),
    height: Number(selected.value.height),
  }
  pendingCreatePos.value = null
  formTitle.value = '編輯區域'
  showForm.value = true
}

async function saveForm() {
  if (!form.value.name) {
    message.warning('請填寫區域名稱')
    return
  }
  saving.value = true
  try {
    if (pendingCreatePos.value) {
      await areaStore.createArea({
        orchard_id: orchardId,
        ...form.value,
        code: genCode('AREA'),
        position_x: pendingCreatePos.value.x,
        position_y: pendingCreatePos.value.y,
        rotation: 0,
        active: true,
      })
      message.success('已新增區域，可直接拖曳調整位置')
    } else if (selected.value) {
      const { code: _ignored, ...rest } = form.value
      await areaStore.updateArea(selected.value.id, { ...rest })
      message.success('已更新')
    }
    showForm.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

function confirmDeleteSelected() {
  const target = selected.value
  if (!target) return
  dialog.warning({
    title: '刪除區域',
    content: `確定刪除「${target.name}」？區域將停用（軟刪除），歷史任務紀錄保留。`,
    positiveText: '刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await areaStore.softDeleteArea(target.id)
        select(null)
        message.success('已刪除')
        await refreshCounts()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '刪除失敗')
      }
    },
  })
}

function confirmHardDeleteSelected() {
  const target = selected.value
  if (!target) return
  dialog.error({
    title: '永久刪除區域',
    content: `將永久刪除「${target.name}」及底下果樹、任務排程與執行歷史，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await areaStore.hardDeleteArea(target.id)
        select(null)
        message.success('區域及相關資料已永久刪除')
        await refreshCounts()
        await loadTaskStats()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

/** 區域果樹統計：總數 + 依類型（地圖區塊副標顯示） */
async function refreshCounts() {
  await masterStore.loadAll()
  const grouped = await treeService.countByAreasGrouped(areaStore.areas.map((a) => a.id))
  for (const a of areaStore.areas) {
    const s = (taskStats[a.id] ??= emptyStat())
    const groups = grouped[a.id] ?? []
    s.treeCount = groups.reduce((sum, g) => sum + g.count, 0)
    s.typeLabel = groups
      .map((g) => `${masterStore.treeTypeName(g.treeTypeId) ?? '未設定'}×${g.count}`)
      .join('　')
  }
}

/** 區域任務統計（今日 / 即將到期 / 逾期） */
async function loadTaskStats() {
  const pending = await getPendingTasks()
  for (const a of areaStore.areas) {
    taskStats[a.id] ??= emptyStat()
    taskStats[a.id]!.today = 0
    taskStats[a.id]!.upcoming = 0
    taskStats[a.id]!.overdue = 0
  }
  for (const p of pending) {
    if (!p.areaId || !areaStore.areas.some((a) => a.id === p.areaId)) continue
    const s = (taskStats[p.areaId] ??= emptyStat())
    if (p.dueStatus === 'DUE_TODAY') s.today++
    else if (p.dueStatus === 'OVERDUE') s.overdue++
    else if (p.dueStatus === 'UPCOMING') s.upcoming++
  }
}

// ------------------------------------------------------------
// 快速指派任務給區域（§24 / §25）
// ------------------------------------------------------------
const quickAssignShow = ref(false)

function openQuickAssign() {
  if (!selected.value) return
  quickAssignShow.value = true
}

// ------------------------------------------------------------
// 此區任務：從抽屜直接開始／繼續執行
// ------------------------------------------------------------
const relatedTasks = ref<PendingTaskInfo[]>([])
const executingId = ref<string | null>(null)
const showReschedule = ref(false)
const rescheduleInfo = ref<PendingTaskInfo | null>(null)

async function loadRelatedTasks() {
  if (!selectedId.value) return
  try {
    const all = await getPendingTasks()
    relatedTasks.value = all.filter(
      (p) =>
        p.assignment.target_type === 'ORCHARD' ||
        (p.assignment.target_type === 'AREA' && p.areaId === selectedId.value),
    )
  } catch {
    relatedTasks.value = []
  }
}

watch(showInfo, (v) => {
  if (v) void loadRelatedTasks()
})

async function execTask(p: PendingTaskInfo) {
  executingId.value = p.assignment.id
  try {
    await taskStore.beginExecution(p.assignment.id)
    showInfo.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '無法開始執行')
  } finally {
    executingId.value = null
  }
}

function openReschedule(p: PendingTaskInfo) {
  rescheduleInfo.value = p
  showReschedule.value = true
}

onMounted(async () => {
  try {
    orchard.value = await orchardService.get(orchardId)
    if (!orchard.value) {
      message.error('找不到果園')
      router.replace('/orchards')
      return
    }
    await Promise.all([areaStore.loadAreas(orchardId), refreshCounts()])

    await loadTaskStats()

    await nextTick()
    focusOnAreas()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }

  window.addEventListener('resize', onResize)
})

/** 定位到所有區域的範圍（沒有區域時退回全圖 fit） */
function focusOnAreas() {
  canvasRef.value?.focusContent(
    areaStore.areas.map((a) => ({
      x: Number(a.position_x),
      y: Number(a.position_y),
      w: Number(a.width),
      h: Number(a.height),
    })),
  )
}

function onResize() {
  focusOnAreas()
}
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function goBack() {
  if (editMode.value) {
    editMode.value = false
    select(null)
    return
  }
  router.push('/orchards')
}

function enterArea() {
  if (!selected.value) return
  router.push(`/orchards/${orchardId}/areas/${selected.value.id}`)
}
</script>

<template>
  <div class="map-view">
    <map-toolbar
      :title="orchard?.name ?? '果園地圖'"
      :subtitle="editMode ? '編輯模式：拖曳區域調整位置' : `${areaStore.areas.length} 個區域`"
      :edit-mode="editMode"
      :can-delete="!!selected"
      add-label="＋ 新增區域"
      @back="goBack"
      @toggle-edit="
        () => {
          editMode = !editMode
          select(null)
        }
      "
      @add="openCreate"
      @delete="confirmDeleteSelected"
    >
      <template #edit-actions>
        <n-button size="small" secondary @click="openCreate">＋ 新增區域</n-button>
        <n-button size="small" secondary :disabled="!selected" @click="openEditSelected">編輯資訊</n-button>
        <n-button size="small" secondary type="error" :disabled="!selected" @click="confirmDeleteSelected">
          刪除
        </n-button>
        <n-button
          v-if="management.unlocked"
          size="small"
          secondary
          type="error"
          :disabled="!selected"
          @click="confirmHardDeleteSelected"
        >
          永久刪除
        </n-button>
      </template>
    </map-toolbar>

    <n-spin :show="loading" class="spin-wrap">
      <map-canvas
        ref="canvasRef"
        v-model:scale="scale"
        v-model:offset-x="offsetX"
        v-model:offset-y="offsetY"
        :width="mapWidth"
        :height="mapHeight"
        @tap="select(null)"
      >
        <area-marker
          v-for="a in areaStore.areas"
          :key="a.id"
          v-model:x="a.position_x"
          v-model:y="a.position_y"
          v-model:scale="scale"
          :width="Number(a.width)"
          :height="Number(a.height)"
          :label="a.name"
          :subtitle="statOf(a.id).typeLabel || null"
          :rotation="Number(a.rotation)"
          :selected="selectedId === a.id"
          :draggable="editMode"
          :badge="statOf(a.id).overdue > 0 ? `逾 ${statOf(a.id).overdue}` : null"
          @select="select(a.id)"
          @drag-end="persistPosition(a.id)"
        />
      </map-canvas>
    </n-spin>

    <map-controls :edit-mode="editMode" @zoom-in="canvasRef?.zoomIn()" @zoom-out="canvasRef?.zoomOut()" @fit="canvasRef?.fit()" />

    <!-- 區域資訊（§55） -->
    <n-drawer v-model:show="showInfo" placement="bottom" :height="400">
      <n-drawer-content v-if="selected" body-content-style="padding-top:4px">
        <template #header>
          <div class="info-head">
            <span class="name">{{ selected.name }}</span>
          </div>
        </template>
        <div class="stat-row">
          <div class="cell">
            <div class="muted">果樹</div>
            <div class="v">{{ statOf(selected.id).treeCount }}</div>
          </div>
          <div class="cell">
            <div class="muted">今日任務</div>
            <div class="v warn">{{ statOf(selected.id).today }}</div>
          </div>
          <div class="cell">
            <div class="muted">即將到期</div>
            <div class="v info">{{ statOf(selected.id).upcoming }}</div>
          </div>
          <div class="cell">
            <div class="muted">逾期</div>
            <div class="v err">{{ statOf(selected.id).overdue }}</div>
          </div>
        </div>
        <div v-if="statOf(selected.id).typeLabel" class="muted" style="margin-top: 8px">
          類型：{{ statOf(selected.id).typeLabel }}
        </div>
        <p class="muted desc">{{ selected.description || '　' }}</p>

        <div v-if="relatedTasks.length" class="related-block">
          <div class="related-title">此區任務（含果園層級）</div>
          <div v-for="p in relatedTasks" :key="p.assignment.id" class="rt-row">
            <n-tag size="tiny" :bordered="false">{{ TARGET_TYPE_LABEL[p.assignment.target_type] }}</n-tag>
            <span class="rt-name">{{ p.task.name }}</span>
            <span class="muted">{{ p.treeCount }} 棵 · {{ formatDate(p.dueDate) }}</span>
            <due-status-tag :status="p.dueStatus" />
            <n-button size="tiny" quaternary @click="openReschedule(p)">調整日期</n-button>
            <n-button
              size="tiny"
              type="primary"
              :loading="executingId === p.assignment.id"
              @click="execTask(p)"
            >
              {{ p.runningBatchId ? '繼續執行' : '執行任務' }}
            </n-button>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <n-button @click="editMode = true; showInfo = false">進入編輯</n-button>
          <n-button type="primary" @click="openQuickAssign">指派任務</n-button>
          <n-button secondary type="primary" @click="enterArea">進入區域</n-button>
        </div>
      </n-drawer-content>
    </n-drawer>

    <task-reschedule-modal
      v-model:show="showReschedule"
      :info="rescheduleInfo"
      @saved="loadRelatedTasks"
    />

    <quick-assign-modal
      v-model:show="quickAssignShow"
      target-type="AREA"
      :target-id="selectedId"
      :target-label="selected?.name ?? ''"
      @created="loadTaskStats"
    />

    <n-modal v-model:show="showForm" preset="card" :title="formTitle" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="區域名稱" required>
          <n-input v-model:value="form.name" placeholder="例如：A 區" />
        </n-form-item>
        <n-form-item label="說明">
          <n-input v-model:value="form.description" type="textarea" :rows="2" placeholder="選填" />
        </n-form-item>
        <div class="size-row">
          <n-form-item label="寬度">
            <n-input-number v-model:value="form.width" :min="50" :max="5000" :step="20" style="width: 100%" />
          </n-form-item>
          <n-form-item label="高度">
            <n-input-number v-model:value="form.height" :min="50" :max="5000" :step="20" style="width: 100%" />
          </n-form-item>
        </div>
        <n-button block type="primary" :loading="saving" @click="saveForm">儲存</n-button>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  background: #f0f2f5;
}

.spin-wrap {
  position: absolute;
  inset: 0;
}

.info-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-head .name {
  font-size: 17px;
  font-weight: 700;
}

.stat-row {
  display: flex;
  gap: 18px;
}

.cell .v {
  font-size: 22px;
  font-weight: 700;
}

.v.warn {
  color: #f0a020;
}

.v.info {
  color: #2080f0;
}

.v.err {
  color: #d03050;
}

.desc {
  margin: 12px 0;
  white-space: pre-wrap;
}

.related-block {
  margin-bottom: 14px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
}

.related-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.rt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  flex-wrap: wrap;
}

.rt-name {
  font-size: 13.5px;
  font-weight: 600;
}

.size-row {
  display: flex;
  gap: 10px;
}
</style>
