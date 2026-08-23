<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
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
import { areaService, orchardService } from '../services/orchardService'
import type { Area, Orchard, TreeStatus } from '../types/database'
import { TREE_STATUS_META } from '../constants/status'
import { formatDate } from '../utils/date'
import { useTreeStore, useMasterStore } from '../stores/tree'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const orchardId = route.params.orchardId as string
const areaId = route.params.areaId as string
const treeStore = useTreeStore()
const masterStore = useMasterStore()

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
})

function openCreate() {
  const c = canvasRef.value?.centerVirtual() ?? { x: 200, y: 200 }
  form.value = {
    code: `T${String(treeStore.trees.length + 1).padStart(3, '0')}`,
    name: '',
    tree_type_id: masterStore.treeTypes[0]?.id ?? null,
    status: 'NORMAL',
    planted_at: null,
    note: '',
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
  }
  pendingCreatePos.value = null
  formTitle.value = '編輯果樹'
  showForm.value = true
}

async function saveForm() {
  if (!form.value.code) {
    message.warning('請填寫果樹編號')
    return
  }
  saving.value = true
  try {
    const payload = {
      code: form.value.code,
      name: form.value.name || null,
      tree_type_id: form.value.tree_type_id,
      status: form.value.status,
      planted_at: form.value.planted_at ? todayStrOf(form.value.planted_at) : null,
      note: form.value.note || null,
    }
    if (pendingCreatePos.value) {
      await treeStore.createTree({
        ...payload,
        area_id: areaId,
        position_x: pendingCreatePos.value.x,
        position_y: pendingCreatePos.value.y,
        active: true,
      })
      message.success('已新增果樹，可直接拖曳調整位置')
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
    canvasRef.value?.ensureFit()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
  window.addEventListener('resize', onResize)
})

function onResize() {
  canvasRef.value?.fit()
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
    <n-drawer v-model:show="showInfo" placement="bottom" :height="300">
      <n-drawer-content v-if="selected" body-content-style="padding-top:4px">
        <template #header>
          <div class="info-head">
            <span class="name">{{ selected.name || selected.code }}</span>
            <n-tag size="small">{{ selected.code }}</n-tag>
            <n-tag size="small" :bordered="false" type="success">{{ typeName(selected.tree_type_id) }}</n-tag>
          </div>
        </template>
        <div class="kv-grid">
          <div><span class="muted">狀態</span>　{{ TREE_STATUS_META[selected.status].label }}</div>
          <div><span class="muted">種植日期</span>　{{ formatDate(selected.planted_at) }}</div>
          <div class="wide"><span class="muted">備註</span>　{{ selected.note || '-' }}</div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <n-button @click="router.push(`/tasks/history?tree=${selected.id}`)">查看此樹任務</n-button>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showForm" preset="card" :title="formTitle" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="編號" required>
          <n-input v-model:value="form.code" placeholder="例如：T001" />
        </n-form-item>
        <n-form-item label="名稱">
          <n-input v-model:value="form.name" placeholder="選填，例如：老芒果樹" />
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
</style>
