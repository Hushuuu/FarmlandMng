<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NButton, NEmpty, NSpin, useMessage } from 'naive-ui'
import MapCanvas from '../orchard/MapCanvas.vue'
import MapControls from '../orchard/MapControls.vue'
import AreaMarker from '../orchard/AreaMarker.vue'
import TreeMarker from '../orchard/TreeMarker.vue'
import { areaService, orchardService } from '../../services/orchardService'
import { useMasterStore } from '../../stores/tree'
import { useTaskStore } from '../../stores/task'
import type { Area, ExecutionItem, ItemStatus, Orchard, Tree } from '../../types/database'

type ExecutionMapItem = ExecutionItem & { tree: Tree | null }
type MappedExecutionItem = ExecutionItem & { tree: Tree }

const props = defineProps<{ items: ExecutionMapItem[] }>()

const message = useMessage()
const taskStore = useTaskStore()
const masterStore = useMasterStore()

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const loading = ref(false)
const updating = ref(false)
const areas = ref<Area[]>([])
const orchard = ref<Orchard | null>(null)
const mapLevel = ref<'AREAS' | 'TREES'>('AREAS')
const activeAreaId = ref<string | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const mapItems = computed<MappedExecutionItem[]>(() =>
  props.items.filter((item): item is MappedExecutionItem => item.tree !== null),
)

const targetKey = computed(() => {
  const batchId = props.items[0]?.execution_batch_id ?? ''
  const areaIds = [...new Set(mapItems.value.map((item) => item.tree.area_id))].sort()
  return `${batchId}:${areaIds.join(',')}`
})

const activeArea = computed(() => areas.value.find((area) => area.id === activeAreaId.value) ?? null)
const visibleTreeItems = computed(() =>
  activeAreaId.value ? mapItems.value.filter((item) => item.tree.area_id === activeAreaId.value) : [],
)
const total = computed(() => mapItems.value.length)
const processedCount = computed(() => mapItems.value.filter((item) => isProcessed(item.status)).length)
const mapWidth = computed(() =>
  mapLevel.value === 'AREAS' ? Number(orchard.value?.map_width ?? 2000) : Number(activeArea.value?.width ?? 300),
)
const mapHeight = computed(() =>
  mapLevel.value === 'AREAS' ? Number(orchard.value?.map_height ?? 1200) : Number(activeArea.value?.height ?? 220),
)
const mapTitle = computed(() =>
  mapLevel.value === 'AREAS' ? '區域總覽' : activeArea.value?.name ?? '區域果樹',
)

const itemStatusColors: Record<ItemStatus, string | null> = {
  PENDING: null,
  COMPLETED: '#18a058',
  SKIPPED: '#f0a020',
  FAILED: '#d03050',
}

function isProcessed(status: ItemStatus): boolean {
  return status === 'COMPLETED' || status === 'SKIPPED'
}

function itemsForArea(areaId: string): MappedExecutionItem[] {
  return mapItems.value.filter((item) => item.tree.area_id === areaId)
}

function progressForArea(areaId: string): { done: number; total: number } {
  const list = itemsForArea(areaId)
  return {
    done: list.filter((item) => isProcessed(item.status)).length,
    total: list.length,
  }
}

function areaChecked(areaId: string): boolean {
  const progress = progressForArea(areaId)
  return progress.total > 0 && progress.done === progress.total
}

function areaIndeterminate(areaId: string): boolean {
  const progress = progressForArea(areaId)
  return progress.done > 0 && progress.done < progress.total
}

function iconOf(treeTypeId: string | null): string {
  if (!treeTypeId) return '🌳'
  return masterStore.treeTypes.find((type) => type.id === treeTypeId)?.icon ?? '🌳'
}

function colorOf(treeTypeId: string | null): string | null {
  if (!treeTypeId) return null
  return masterStore.treeTypes.find((type) => type.id === treeTypeId)?.color ?? null
}

function statusDot(status: ItemStatus): string | null {
  return itemStatusColors[status]
}

async function loadMapData() {
  const requestKey = targetKey.value
  loading.value = true
  try {
    const areaIds = [...new Set(mapItems.value.map((item) => item.tree.area_id))]
    if (!areaIds.length) {
      areas.value = []
      orchard.value = null
      activeAreaId.value = null
      mapLevel.value = 'AREAS'
      return
    }

    const targetAreas = await areaService.listByIds(areaIds)
    if (!targetAreas.length) throw new Error('找不到執行批次所屬區域')
    if (targetAreas.length !== areaIds.length) throw new Error('執行批次有區域資料遺失，無法完整顯示地圖')

    const orchardIds = [...new Set(targetAreas.map((area) => area.orchard_id))]
    if (orchardIds.length !== 1) throw new Error('執行批次跨越多個果園，無法顯示單一地圖')
    const targetOrchard = await orchardService.get(orchardIds[0]!)
    if (!targetOrchard) throw new Error('找不到執行批次所屬果園')

    await masterStore.loadAll()
    if (targetKey.value !== requestKey) return

    areas.value = targetAreas
    orchard.value = targetOrchard
    if (!activeAreaId.value || !targetAreas.some((area) => area.id === activeAreaId.value)) {
      activeAreaId.value = targetAreas[0]?.id ?? null
    }
    mapLevel.value = 'AREAS'
    await nextTick()
    mapCanvas.value?.fit()
  } catch (error) {
    if (targetKey.value !== requestKey) return
    areas.value = []
    orchard.value = null
    activeAreaId.value = null
    message.error(error instanceof Error ? error.message : '載入執行地圖失敗')
  } finally {
    if (targetKey.value === requestKey) loading.value = false
  }
}

watch(targetKey, () => {
  void loadMapData()
}, { immediate: true })

async function enterArea(areaId: string) {
  activeAreaId.value = areaId
  mapLevel.value = 'TREES'
  await nextTick()
  mapCanvas.value?.fit()
}

async function showAreas() {
  mapLevel.value = 'AREAS'
  await nextTick()
  mapCanvas.value?.fit()
}

async function toggleTree(item: MappedExecutionItem) {
  if (updating.value) return
  updating.value = true
  try {
    const nextStatus: ItemStatus = item.status === 'PENDING' ? 'COMPLETED' : 'PENDING'
    await taskStore.setItemsStatus([item.id], nextStatus)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新果樹執行狀態失敗')
  } finally {
    updating.value = false
  }
}

async function toggleArea(areaId: string) {
  if (updating.value) return
  const areaItems = itemsForArea(areaId)
  if (!areaItems.length) return
  updating.value = true
  try {
    const nextStatus: ItemStatus = areaChecked(areaId) ? 'PENDING' : 'COMPLETED'
    await taskStore.setItemsStatus(areaItems.map((item) => item.id), nextStatus)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新區域執行狀態失敗')
  } finally {
    updating.value = false
  }
}
</script>

<template>
  <div class="execution-map">
    <div class="map-head">
      <div class="map-title">
        <n-button v-if="mapLevel === 'TREES'" size="tiny" quaternary @click="showAreas">← 區域總覽</n-button>
        <span>{{ mapTitle }}</span>
      </div>
      <span class="map-progress">{{ processedCount }} / {{ total }} 已處理</span>
    </div>
    <div class="map-hint muted">
      {{ mapLevel === 'AREAS' ? '點擊區域進入果樹；左上角勾選可整區完成。' : '點擊果樹標記即可切換完成，再按左上角返回區域總覽。' }}
    </div>

    <div class="map-viewport">
      <n-spin :show="loading" class="map-spin">
        <n-empty v-if="!loading && !mapItems.length" description="沒有可顯示的果樹" style="padding-top: 80px" />
        <map-canvas
          v-else
          ref="mapCanvas"
          v-model:scale="scale"
          v-model:offset-x="offsetX"
          v-model:offset-y="offsetY"
          :width="mapWidth"
          :height="mapHeight"
        >
          <template v-if="mapLevel === 'AREAS'">
            <area-marker
              v-for="area in areas"
              :key="area.id"
              :x="area.position_x"
              :y="area.position_y"
              :scale="scale"
              :width="Number(area.width)"
              :height="Number(area.height)"
              :label="area.name"
              :subtitle="`已處理 ${progressForArea(area.id).done} / ${progressForArea(area.id).total}`"
              :checkable="true"
              :checked="areaChecked(area.id)"
              :indeterminate="areaIndeterminate(area.id)"
              @select="enterArea(area.id)"
              @toggle="toggleArea(area.id)"
            />
          </template>
          <template v-else>
            <tree-marker
              v-for="item in visibleTreeItems"
              :key="item.id"
              :x="item.tree.position_x"
              :y="item.tree.position_y"
              :scale="scale"
              :label="item.tree.name || item.tree.code"
              :icon="iconOf(item.tree.tree_type_id)"
              :color="colorOf(item.tree.tree_type_id)"
              :status-dot="statusDot(item.status)"
              :selected="isProcessed(item.status)"
              :checkable="true"
              :checked="isProcessed(item.status)"
              :check-state="item.status"
              @select="toggleTree(item)"
              @toggle="toggleTree(item)"
            />
          </template>
        </map-canvas>
        <map-controls
          v-if="!loading && mapItems.length"
          @zoom-in="mapCanvas?.zoomIn()"
          @zoom-out="mapCanvas?.zoomOut()"
          @fit="mapCanvas?.fit()"
        />
      </n-spin>
    </div>
  </div>
</template>

<style scoped>
.execution-map {
  margin-top: 10px;
}

.map-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.map-title {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
}

.map-progress {
  flex-shrink: 0;
  color: #18a058;
  font-size: 13px;
  font-weight: 700;
}

.map-hint {
  margin: 4px 0 8px;
}

.map-viewport {
  position: relative;
  height: min(46vh, 420px);
  min-height: 260px;
  overflow: hidden;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
  background: #f0f2f5;
}

.map-spin {
  position: absolute;
  inset: 0;
}

:deep(.n-spin-container) {
  height: 100%;
}
</style>
