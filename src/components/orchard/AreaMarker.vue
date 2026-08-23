<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    width: number
    height: number
    label: string
    rotation?: number
    selected?: boolean
    draggable?: boolean
    badge?: string | null
  }>(),
  { rotation: 0, selected: false, draggable: false, badge: null },
)

const x = defineModel<number>('x', { required: true })
const y = defineModel<number>('y', { required: true })
const scaleModel = defineModel<number>('scale', { default: 1 })

const emit = defineEmits<{ select: []; 'drag-end': [] }>()

const el = ref<HTMLElement | null>(null)
let dragging = false
let startX = 0
let startY = 0
let baseX = 0
let baseY = 0

function onPointerDown(e: PointerEvent) {
  if (!props.draggable) return
  e.stopPropagation()
  el.value?.setPointerCapture(e.pointerId)
  dragging = true
  startX = e.clientX
  startY = e.clientY
  baseX = x.value
  baseY = y.value
}

/** 拖曳中即時更新 model → UI 跟著移動（§57） */
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  x.value = Math.round(baseX + (e.clientX - startX) / scaleModel.value)
  y.value = Math.round(baseY + (e.clientY - startY) / scaleModel.value)
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  const moved = Math.abs(x.value - baseX) > 0.5 || Math.abs(y.value - baseY) > 0.5
  if (moved) emit('drag-end')
}

const style = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  width: `${props.width}px`,
  height: `${props.height}px`,
  transform: `rotate(${props.rotation}deg)`,
}))
</script>

<template>
  <div
    ref="el"
    class="area-marker"
    :class="{ selected, draggable }"
    :style="style"
    @click.stop="emit('select')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="area-label">{{ label }}</div>
    <div v-if="badge" class="area-badge">{{ badge }}</div>
  </div>
</template>

<style scoped>
.area-marker {
  position: absolute;
  background: rgba(24, 160, 88, 0.14);
  border: 2px solid #36ad6a;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.area-marker.selected,
.area-marker:hover {
  background: rgba(24, 160, 88, 0.24);
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.35);
}

.area-marker.draggable {
  cursor: grab;
  touch-action: none;
}

.area-label {
  font-size: 18px;
  font-weight: 700;
  color: #14663c;
  text-align: center;
  padding: 4px;
  pointer-events: none;
}

.area-badge {
  position: absolute;
  top: -10px;
  right: -10px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #e88080;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>
