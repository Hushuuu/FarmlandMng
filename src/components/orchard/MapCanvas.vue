<!-- 地圖畫布 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    width: number
    height: number
    minScale?: number
    maxScale?: number
    showCenter?: boolean
  }>(),
  { minScale: 0.08, maxScale: 4, showCenter: true },
)

const scale = defineModel<number>('scale', { default: 1 })
const offsetX = defineModel<number>('offsetX', { default: 0 })
const offsetY = defineModel<number>('offsetY', { default: 0 })

const emit = defineEmits<{ tap: [] }>()

const vp = ref<HTMLElement | null>(null)

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

let windowListenersAttached = false

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

/**
 * 內容 bbox：縮放平移讓所有項目落在視野內（無項目則退回全圖 fit）
 * - margin：螢幕固定像素邊距，項目多時盡量填滿視窗、只留固定邊距
 * - maxScale：放大上限，項目少時避免過度放大失去 context
 */
function focusContent(
  items: { x: number; y: number; w?: number; h?: number }[],
  opts: { margin?: number; maxScale?: number } = {},
) {
  if (!items.length) {
    fit()
    return
  }
  const { w, h } = vpSize()
  if (!w || !h) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of items) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + (it.w ?? 0))
    maxY = Math.max(maxY, it.y + (it.h ?? 0))
  }
  // bbox 過小間名除以零／極端值
  const MIN_CONTENT = 100
  const bw = Math.max(maxX - minX, MIN_CONTENT)
  const bh = Math.max(maxY - minY, MIN_CONTENT)
  const m = opts.margin ?? 48
  const sFit = Math.min(Math.max(w - m * 2, 1) / bw, Math.max(h - m * 2, 1) / bh)
  const s = Math.min(props.maxScale, Math.max(props.minScale, Math.min(sFit, opts.maxScale ?? 1.25)))
  scale.value = s
  offsetX.value = w / 2 - ((minX + maxX) / 2) * s
  offsetY.value = h / 2 - ((minY + maxY) / 2) * s
}

function zoomAt(factor: number, cx: number, cy: number) {
  const ns = Math.min(props.maxScale, Math.max(props.minScale, scale.value * factor))
  const k = ns / scale.value
  offsetX.value = cx - (cx - offsetX.value) * k
  offsetY.value = cy - (cy - offsetY.value) * k
  scale.value = ns
}

/** 不使用 setPointerCapture：capture 會把 click 重定向到畫布，導致 Marker 點不到 */
function attachWindow() {
  if (windowListenersAttached) return
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', onWindowUp)
  window.addEventListener('pointercancel', onWindowUp)
  windowListenersAttached = true
}

function detachWindow() {
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', onWindowUp)
  window.removeEventListener('pointercancel', onWindowUp)
  windowListenersAttached = false
}

function onPointerDown(e: PointerEvent) {
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
  attachWindow()
}

function onWindowMove(e: PointerEvent) {
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

function onWindowUp(e: PointerEvent) {
  const sizeBefore = pointers.size
  const wasSingleTap = panStart !== null && !panStart.moved && sizeBefore === 1 && pinchStart === null
  pointers.delete(e.pointerId)
  if (sizeBefore - 1 < 2) pinchStart = null
  if (sizeBefore - 1 <= 0) {
    panStart = null
    detachWindow()
  }
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

onBeforeUnmount(() => {
  detachWindow()
})

defineExpose({ fit, focusContent, zoomIn: () => {
  const { w, h } = vpSize()
  zoomAt(1.25, w / 2, h / 2)
}, zoomOut: () => {
  const { w, h } = vpSize()
  zoomAt(1 / 1.25, w / 2, h / 2)
}, centerVirtual })
</script>

<template>
  <div ref="vp" class="map-canvas" @pointerdown="onPointerDown" @wheel.prevent="onWheel">
    <div
      class="map-layer"
      :style="{
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
      }"
    >
      <slot />
      <div
        v-if="showCenter"
        class="map-center"
        aria-hidden="true"
        :style="{
          left: `${width / 2}px`,
          top: `${height / 2}px`,
          transform: `translate(-50%, -50%) scale(${1 / Math.max(scale, 0.01)})`,
        }"
      >
        <span class="map-center-h" />
        <span class="map-center-v" />
        <span class="map-center-ring" />
        <!-- <span class="map-center-label">中心</span> -->
      </div>
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

.map-center {
  position: absolute;
  width: 44px;
  height: 44px;
  pointer-events: none;
  z-index: 6;
  opacity: 0.75;
}

.map-center-h,
.map-center-v {
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(24, 160, 88, 0.75);
}

.map-center-h {
  width: 22px;
  height: 2px;
  transform: translate(-50%, -50%);
}

.map-center-v {
  width: 2px;
  height: 22px;
  transform: translate(-50%, -50%);
}

.map-center-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(24, 160, 88, 0.95);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
}

.map-center-label {
  position: absolute;
  left: 50%;
  top: calc(50% + 16px);
  transform: translateX(-50%);
  padding: 1px 5px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  color: #2f9e63;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}
</style>
