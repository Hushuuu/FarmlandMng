<!-- 地圖控制按鈕 -->
<script setup lang="ts">
defineProps<{ editMode?: boolean }>()
const emit = defineEmits<{ 'zoom-in': []; 'zoom-out': []; fit: [] }>()
</script>

<template>
  <div class="map-controls" :class="{ raised: editMode }">
    <button class="ctrl-btn" title="放大" @click.stop="emit('zoom-in')">＋</button>
    <button class="ctrl-btn" title="縮小" @click.stop="emit('zoom-out')">－</button>
    <button class="ctrl-btn" title="顯示全部" @click.stop="emit('fit')">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path
          d="M5 15H3v4c0 1.1.9 2 2 2h4v-2H5v-4zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2V5zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2zm0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.map-controls {
  position: absolute;
  right: 12px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20;
}

.map-controls.raised {
  bottom: 72px;
}

.ctrl-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: #fff;
  color: #333;
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ctrl-btn:active {
  background: #eef0f3;
}
</style>
