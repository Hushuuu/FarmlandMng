<!-- 地圖上的果園區塊 -->
<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    width: number
    height: number
    label: string
    subtitle?: string | null
    rotation?: number
    selected?: boolean
    draggable?: boolean
    badge?: string | null
    checkable?: boolean
    checked?: boolean
    indeterminate?: boolean
  }>(),
  {
    subtitle: null,
    rotation: 0,
    selected: false,
    draggable: false,
    badge: null,
    checkable: false,
    checked: false,
    indeterminate: false,
  },
)

const x = defineModel<number>('x', { required: true })
const y = defineModel<number>('y', { required: true })
const scaleModel = defineModel<number>('scale', { default: 1 })

const emit = defineEmits<{ select: []; toggle: []; 'drag-end': [] }>()

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
    :class="{ selected, draggable, checked, indeterminate }"
    :style="style"
    @click.stop="emit('select')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <button
      v-if="checkable"
      type="button"
      class="check-button"
      :class="{ checked, indeterminate }"
      :aria-label="checked ? `取消勾選${label}` : `勾選${label}`"
      @pointerdown.stop
      @click.stop="emit('toggle')"
    >
      {{ checked ? '✓' : indeterminate ? '−' : '' }}
    </button>
    <div class="area-label">{{ label }}</div>
    <div v-if="subtitle" class="area-sub">{{ subtitle }}</div>
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

.area-marker.checked {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.24);
}

.area-marker.indeterminate {
  border-color: #f0a020;
}

.area-marker.draggable {
  cursor: grab;
  touch-action: none;
}

.check-button {
  position: absolute;
  top: 7px;
  left: 7px;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid #b9bec4;
  border-radius: 7px;
  background: #fff;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}

.check-button.checked {
  border-color: #18a058;
  background: #18a058;
}

.check-button.indeterminate {
  border-color: #f0a020;
  background: #f0a020;
}

.area-label {
  font-size: 18px;
  font-weight: 700;
  color: #14663c;
  text-align: center;
  padding: 4px;
  pointer-events: none;
}

.area-sub {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
  color: #2c7a52;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
