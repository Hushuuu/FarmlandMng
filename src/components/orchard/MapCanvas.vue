<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    width: number
    height: number
    minScale?: number
    maxScale?: number
  }>(),
  { minScale: 0.08, maxScale: 4 },
)

const scale = defineModel<number>('scale', { default: 1 })
const offsetX = defineModel<number>('offsetX', { default: 0 })
const offsetY = defineModel<number>('offsetY', { default: 0 })

const emit = defineEmits<{ tap: [] }>()

const vp = ref<HTMLElement | null>(null)
let fitted = false

interface P {
  x: number
  y: number
}
const pointers = new Map<number, P>()
let panStart: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null
let pinchStart: {
  dist: number
  cx: number
  cy: number
  scale: number
  ox: number
  oy: number
} | null = null

function vpSize() {
  return { w: vp.value?.clientWidth ?? 0, h: vp.value?.clientHeight ?? 0 }
}

function fit(padding = 0.92) {
  const { w, h } = vpSize()
  if (!w || !h) return
  const s = Math.min(w / props.width, h / props.height) * padding
  scale.value = s
  offsetX.value = (w - props.width * s) / 2
  offsetY.value = (h - props.height * s) / 2
}

function zoomAt(factor: number, cx: number, cy: number) {
  const ns = Math.min(props.maxScale, Math.max(props.minScale, scale.value * factor))
  const k = ns / scale.value
  offsetX.value = cx - (cx - offsetX.value) * k
  offsetY.value = cy - (cy - offsetY.value) * k
  scale.value = ns
}

function onPointerDown(e: PointerEvent) {
  vp.value?.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      scale: scale.value,
      ox: offsetX.value,
      oy: offsetY.value,
    }
    panStart = null
  } else if (pointers.size === 1) {
    panStart = { x: e.clientX, y: e.clientY, ox: offsetX.value, oy: offsetY.value, moved: false }
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size >= 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const ns = Math.min(props.maxScale, Math.max(props.minScale, (pinchStart.scale * d) / pinchStart.dist))
    const k = ns / pinchStart.scale
    offsetX.value = pinchStart.cx - (pinchStart.cx - pinchStart.ox) * k
    offsetY.value = pinchStart.cy - (pinchStart.cy - pinchStart.oy) * k
    scale.value = ns
  } else if (panStart && pointers.size === 1) {
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panStart.moved = true
    offsetX.value = panStart.ox + dx
    offsetY.value = panStart.oy + dy
  }
}

function onPointerUp(e: PointerEvent) {
  const sizeBefore = pointers.size
  const wasSingleTap = panStart !== null && !panStart.moved && sizeBefore === 1 && pinchStart === null
  pointers.delete(e.pointerId)
  if (sizeBefore - 1 < 2) pinchStart = null
  panStart = null
  if (wasSingleTap && sizeBefore - 1 === 0) emit('tap')
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = vp.value!.getBoundingClientRect()
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top)
}

/** 螢幕中心 → 虛擬座標（新增物件預設位置） */
function centerVirtual() {
  const { w, h } = vpSize()
  return {
    x: Math.round((w / 2 - offsetX.value) / scale.value),
    y: Math.round((h / 2 - offsetY.value) / scale.value),
  }
}

onMounted(() => {
  fit()
})

defineExpose({ fit, zoomIn: () => {
  const { w, h } = vpSize()
  zoomAt(1.25, w / 2, h / 2)
}, zoomOut: () => {
  const { w, h } = vpSize()
  zoomAt(1 / 1.25, w / 2, h / 2)
}, centerVirtual, ensureFit: () => {
  if (!fitted) {
    fitted = true
    fit()
  }
} })
</script>

<template>
  <div
    ref="vp"
    class="map-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <div
      class="map-layer"
      :style="{
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
      }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.map-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  background:
    linear-gradient(#e6e9ee 1px, transparent 1px),
    linear-gradient(90deg, #e6e9ee 1px, transparent 1px),
    #f0f2f5;
  background-size: 100px 100px;
}

.map-layer {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
</style>
