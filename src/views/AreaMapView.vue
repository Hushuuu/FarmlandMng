<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import MapCanvas from '../components/orchard/MapCanvas.vue'
import MapControls from '../components/orchard/MapControls.vue'
import MapToolbar from '../components/orchard/MapToolbar.vue'
import TreeMarker from '../components/orchard/TreeMarker.vue'
import QuickAssignModal from '../components/task/QuickAssignModal.vue'
import TaskRescheduleModal from '../components/task/TaskRescheduleModal.vue'
import DueStatusTag from '../components/task/DueStatusTag.vue'
import { areaService, orchardService } from '../services/orchardService'
import { getPendingTasks } from '../services/taskService'
import type { Area, Orchard, PendingTaskInfo, TreeStatus } from '../types/database'
import { TARGET_TYPE_LABEL, TREE_STATUS_META } from '../constants/status'
import { formatDate } from '../utils/date'
import { genCode } from '../utils/code'
import { useTreeStore, useMasterStore } from '../stores/tree'
import { useTaskStore } from '../stores/task'
import { useManagementStore } from '../stores/management'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const orchardId = route.params.orchardId as string
const areaId = route.params.areaId as string
const treeStore = useTreeStore()
const masterStore = useMasterStore()
const taskStore = useTaskStore()
const management = useManagementStore()

const canvasRef = ref<InstanceType<typeof MapCanvas> | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const loading = ref(true)
const orchard = ref<Orchard | null>(null)
const area = ref<Area | null>(null)
const editMode = ref(false)
const selectedId = ref<string | null>(null)
const showInfo = ref(false)

const selected = computed(() => treeStore.trees.find((t) => t.id === selectedId.value) ?? null)

// 快速指派任務給果樹（§27）
const quickAssignShow = ref(false)

function openQuickAssign() {
  if (!selected.value) return
  quickAssignShow.value = true
}

// 此樹相關任務（單樹 + 所屬區域 + 所屬果園）
const relatedTasks = ref<PendingTaskInfo[]>([])
const executingId = ref<string | null>(null)
const showReschedule = ref(false)
const rescheduleInfo = ref<PendingTaskInfo | null>(null)

async function loadRelatedTasks() {
  if (!selected.value) return
  try {
    const all = await getPendingTasks()
    const tid = selected.value.id
    relatedTasks.value = all.filter((p) => {
      if (p.assignment.target_type === 'TREE') return p.assignment.target_id === tid
      if (p.assignment.target_type === 'AREA') return p.areaId === areaId
      return p.orchardId === orchardId
    })
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

function select(id: string | null) {
  selectedId.value = id
  showInfo.value = !!id && !editMode.value
}

async function persistPosition(treeId: string) {
  const t = treeStore.trees.find((x) => x.id === treeId)
  if (!t) return
  try {
    await treeStore.updateTreePosition(treeId, t.position_x, t.position_y)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存位置失敗')
  }
}

// ------------------------------------------------------------
// 新增 / 編輯果樹（§58）
// ------------------------------------------------------------
const showForm = ref(false)
const formTitle = ref('新增果樹')
const saving = ref(false)
const pendingCreatePos = ref<{ x: number; y: number } | null>(null)
const form = ref({
  code: '',
  name: '',
  tree_type_id: null as string | null,
  status: 'NORMAL' as TreeStatus,
  planted_at: null as number | null,
  note: '',
  count: 1,
})

function openCreate() {
  const c = canvasRef.value?.centerVirtual() ?? { x: 200, y: 200 }
  form.value = {
    code: '',
    name: '',
    tree_type_id: masterStore.treeTypes[0]?.id ?? null,
    status: 'NORMAL',
    planted_at: null,
    note: '',
    count: 1,
  }
  pendingCreatePos.value = { x: c.x, y: c.y }
  formTitle.value = '新增果樹（建立後可拖曳調整位置）'
  showForm.value = true
}

function openEditSelected() {
  const t = selected.value
  if (!t) return
  form.value = {
    code: t.code,
    name: t.name ?? '',
    tree_type_id: t.tree_type_id,
    status: t.status,
    planted_at: t.planted_at ? new Date(t.planted_at).getTime() : null,
    note: t.note ?? '',
    count: 1,
  }
  pendingCreatePos.value = null
  formTitle.value = '編輯果樹'
  showForm.value = true
}

function horizontalPositions(count: number, center: { x: number; y: number }) {
  const width = Number(area.value?.width ?? 300)
  const height = Number(area.value?.height ?? 220)
  const edgePadding = 34
  const spacing =
    count > 1
      ? Math.min(80, Math.max(44, (width - edgePadding * 2) / (count - 1)))
      : 0
  const rowWidth = spacing * (count - 1)
  const minStartX = edgePadding
  const maxStartX = width - edgePadding - rowWidth
  const startX = Math.max(minStartX, Math.min(maxStartX, center.x - rowWidth / 2))
  const y = Math.max(edgePadding, Math.min(height - edgePadding, center.y))

  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(startX + spacing * index),
    y: Math.round(y),
  }))
}

async function saveForm() {
  saving.value = true
  try {
    const payload = {
      name: form.value.name || null,
      tree_type_id: form.value.tree_type_id,
      status: form.value.status,
      planted_at: form.value.planted_at ? todayStrOf(form.value.planted_at) : null,
      note: form.value.note || null,
    }
    if (pendingCreatePos.value) {
      const count = Math.floor(Number(form.value.count))
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        message.warning('新增數量請填寫 1～100 棵')
        return
      }
      const positions = horizontalPositions(count, pendingCreatePos.value)
      const baseName = form.value.name.trim()
      const inputs = positions.map((position, index) => ({
        ...payload,
        name: baseName
          ? `${baseName}${count > 1 ? ` ${index + 1}` : ''}`
          : null,
        code: genCode('TREE'),
        area_id: areaId,
        position_x: position.x,
        position_y: position.y,
        active: true,
      }))
      const created = await treeStore.createTrees(inputs)
      message.success(`已新增 ${created.length} 棵果樹，已橫向排列，可直接拖曳調整位置`)
    } else if (selected.value) {
      await treeStore.updateTree(selected.value.id, payload)
      message.success('已更新')
    }
    showForm.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

function todayStrOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function confirmDeleteSelected() {
  const t = selected.value
  if (!t) return
  dialog.warning({
    title: '刪除果樹',
    content: `確定刪除「${t.name || t.code}」？果樹將停用（軟刪除），歷史任務紀錄保留。`,
    positiveText: '刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await treeStore.softDeleteTree(t.id)
        select(null)
        message.success('已刪除')
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
    title: '永久刪除果樹',
    content: `將永久刪除「${target.name || target.code}」及其任務排程與執行歷史，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await treeStore.hardDeleteTree(target.id)
        select(null)
        message.success('果樹及相關資料已永久刪除')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

function typeName(id: string | null): string {
  if (!id) return '未設定'
  return masterStore.treeTypeName(id) ?? '未設定'
}

function iconOf(id: string | null): string {
  if (!id) return '🌳'
  return masterStore.treeTypes.find((t) => t.id === id)?.icon ?? '🌳'
}

function colorOf(id: string | null): string | null {
  if (!id) return null
  return masterStore.treeTypes.find((t) => t.id === id)?.color ?? null
}

function dotColor(status: TreeStatus): string | null {
  return status === 'NORMAL' ? null : TREE_STATUS_META[status].color
}

onMounted(async () => {
  try {
    await masterStore.loadAll()
    const [o, a] = await Promise.all([orchardService.get(orchardId), areaService.get(areaId)])
    orchard.value = o
    area.value = a
    if (!a) {
      message.error('找不到區域')
      router.replace(`/orchards/${orchardId}/map`)
      return
    }
    await treeStore.loadTrees(areaId)
    await nextTick()
    focusOnTrees()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
  window.addEventListener('resize', onResize)
})

/** 定位到所有果樹的範圍（沒有果樹時退回全圖 fit） */
function focusOnTrees() {
  canvasRef.value?.focusContent(
    treeStore.trees.map((t) => ({ x: Number(t.position_x), y: Number(t.position_y) })),
  )
}

function onResize() {
  focusOnTrees()
}
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function goBack() {
  if (editMode.value) {
    editMode.value = false
    select(null)
    return
  }
  router.push(`/orchards/${orchardId}/map`)
}
</script>

<template>
  <div class="map-view">
    <map-toolbar
      :title="area?.name ?? '區域地圖'"
      :subtitle="editMode ? `${orchard?.name ?? ''} · 編輯模式：拖曳果樹調整位置` : `${orchard?.name ?? ''} · ${treeStore.trees.length} 棵果樹`"
      :edit-mode="editMode"
      :can-delete="!!selected"
      add-label="＋ 新增果樹"
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
        <n-button size="small" secondary @click="openCreate">＋ 新增果樹</n-button>
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
        :width="Number(orchard?.map_width ?? 2000)"
        :height="Number(orchard?.map_height ?? 1200)"
        @tap="select(null)"
      >
        <tree-marker
          v-for="t in treeStore.trees"
          :key="t.id"
          v-model:x="t.position_x"
          v-model:y="t.position_y"
          v-model:scale="scale"
          :label="t.name || t.code"
          :icon="iconOf(t.tree_type_id)"
          :color="colorOf(t.tree_type_id)"
          :status-dot="dotColor(t.status)"
          :selected="selectedId === t.id"
          :draggable="editMode"
          @select="select(t.id)"
          @drag-end="persistPosition(t.id)"
        />
      </map-canvas>
    </n-spin>

    <map-controls :edit-mode="editMode" @zoom-in="canvasRef?.zoomIn()" @zoom-out="canvasRef?.zoomOut()" @fit="canvasRef?.fit()" />

    <!-- 果樹資訊（§56） -->
    <n-drawer v-model:show="showInfo" placement="bottom" :height="360">
      <n-drawer-content v-if="selected" body-content-style="padding-top:4px">
        <template #header>
          <div class="info-head">
            <span class="name">{{ selected.name || selected.code }}</span>
            <n-tag size="small" :bordered="false" type="success">{{ typeName(selected.tree_type_id) }}</n-tag>
          </div>
        </template>
        <div class="kv-grid">
          <div><span class="muted">狀態</span>　{{ TREE_STATUS_META[selected.status].label }}</div>
          <div><span class="muted">種植日期</span>　{{ formatDate(selected.planted_at) }}</div>
          <div class="wide"><span class="muted">備註</span>　{{ selected.note || '-' }}</div>
        </div>

        <div v-if="relatedTasks.length" class="related-block">
          <div class="related-title">相關任務（單樹／區域／果園）</div>
          <div v-for="p in relatedTasks" :key="p.assignment.id" class="rt-row">
            <n-tag size="tiny" :bordered="false">{{ TARGET_TYPE_LABEL[p.assignment.target_type] }}</n-tag>
            <span class="rt-name">{{ p.task.name }}</span>
            <span class="muted">{{ formatDate(p.dueDate) }}</span>
            <due-status-tag :status="p.dueStatus" />
            <n-button size="tiny" @click="openReschedule(p)">
              {{ p.runningBatchId ? '展延日期' : p.dueStatus === 'OVERDUE' ? '展延日期' : '調整日期' }}
            </n-button>
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
          <n-button type="primary" @click="openQuickAssign">指派任務給此樹</n-button>
          <n-button @click="router.push(`/tasks/history?tree=${selected.id}`)">查看此樹任務</n-button>
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
      target-type="TREE"
      :target-id="selectedId"
      :target-label="selected ? selected.name || selected.code : ''"
    />

    <n-modal v-model:show="showForm" preset="card" :title="formTitle" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="名稱">
          <n-input v-model:value="form.name" placeholder="選填，例如：老芒果樹" />
        </n-form-item>
        <n-form-item v-if="pendingCreatePos" label="新增數量">
          <n-input-number v-model:value="form.count" :min="1" :max="100" :precision="0" style="width: 100%" />
          <div class="muted">會以目前地圖中心為基準橫向排列，建立後可拖曳調整位置。</div>
        </n-form-item>
        <n-form-item label="果樹類型">
          <n-select v-model:value="form.tree_type_id" :options="masterStore.treeTypeOptions" placeholder="選擇類型" clearable />
        </n-form-item>
        <n-form-item label="狀態">
          <n-select
            v-model:value="form.status"
            :options="(Object.keys(TREE_STATUS_META) as TreeStatus[]).map((s) => ({ label: TREE_STATUS_META[s].label, value: s }))"
          />
        </n-form-item>
        <n-form-item label="種植日期">
          <n-date-picker v-model:value="form.planted_at" type="date" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="備註">
          <n-input v-model:value="form.note" type="textarea" :rows="2" placeholder="選填" />
        </n-form-item>
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
  flex-wrap: wrap;
}

.info-head .name {
  font-size: 17px;
  font-weight: 700;
}

.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}

.kv-grid .wide {
  grid-column: span 2;
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
</style>
