<!-- 地圖工具列 -->
<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { ArrowBackIosNewOutlined, EditOutlined } from '@vicons/material'

defineProps<{
  title: string
  subtitle?: string
  editMode?: boolean
  canDelete?: boolean
  addLabel?: string
}>()

const emit = defineEmits<{
  back: []
  'toggle-edit': []
  add: []
  delete: []
}>()
</script>

<template>
  <div class="map-toolbar">
    <div class="toolbar-left">
      <button class="back-btn" @click.stop="emit('back')">
        <n-icon size="16"><ArrowBackIosNewOutlined /></n-icon>
      </button>
      <div class="toolbar-title">
        <div class="t">{{ title }}</div>
        <div v-if="subtitle" class="s">{{ subtitle }}</div>
      </div>
    </div>

    <div class="toolbar-right">
      <template v-if="!editMode">
        <n-button size="small" secondary type="primary" @click.stop="emit('toggle-edit')">
          <template #icon><n-icon><EditOutlined /></n-icon></template>
          編輯
        </n-button>
      </template>
      <template v-else>
        <slot name="edit-actions">
          <n-button size="small" secondary @click.stop="emit('add')">{{ addLabel ?? '新增' }}</n-button>
          <n-button
            size="small"
            secondary
            type="error"
            :disabled="!canDelete"
            @click.stop="emit('delete')"
          >
            刪除
          </n-button>
        </slot>
        <n-button size="small" type="primary" @click.stop="emit('toggle-edit')">完成</n-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.map-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid #e5e7eb;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.back-btn:hover {
  background: #f0f1f3;
}

.toolbar-title {
  min-width: 0;
}

.toolbar-title .t {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-title .s {
  font-size: 11px;
  color: #8a8f96;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
