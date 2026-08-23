<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    icon?: string
    label: string
    selected?: boolean
    draggable?: boolean
    color?: string | null
    statusDot?: string | null
  }>(),
  { icon: '🌳', selected: false, draggable: false, color: null, statusDot: null },
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
}))
</script>

<template>
  <div
    ref="el"
    class="tree-marker"
    :class="{ selected, draggable }"
    :style="style"
    @click.stop="emit('select')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="tree-dot" :style="{ borderColor: color ?? '#2f9e63' }">
      <span class="tree-icon">{{ icon }}</span>
      <span v-if="statusDot" class="status-dot" :style="{ background: statusDot }" />
    </div>
    <div class="tree-label">{{ label }}</div>
  </div>
</template>

<style scoped>
.tree-marker {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
  cursor: pointer;
}

.tree-marker.draggable {
  cursor: grab;
  touch-action: none;
}

.tree-dot {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid #2f9e63;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}

.tree-marker.selected .tree-dot {
  border-width: 3px;
  box-shadow:
    0 0 0 4px rgba(24, 160, 88, 0.35),
    0 1px 4px rgba(0, 0, 0, 0.18);
}

.tree-icon {
  font-size: 19px;
  line-height: 1;
  pointer-events: none;
}

.status-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid #fff;
}

.tree-label {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
  color: #33403a;
  background: rgba(255, 255, 255, 0.85);
  padding: 0 5px;
  border-radius: 6px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
</style>
