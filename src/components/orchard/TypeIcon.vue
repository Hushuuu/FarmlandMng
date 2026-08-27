<script setup lang="ts">
import { computed } from 'vue'
import { isImageIcon } from '../../utils/icon'

const props = withDefaults(
  defineProps<{
    icon?: string | null
    size?: number
    fallback?: string
  }>(),
  { size: 20, fallback: '🌳' },
)

const image = computed(() => isImageIcon(props.icon))
</script>

<template>
  <img
    v-if="image"
    class="type-icon-img"
    :src="icon!"
    alt=""
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
  <span v-else class="type-icon-emoji" :style="{ fontSize: `${size}px` }">{{ icon || fallback }}</span>
</template>

<style scoped>
.type-icon-img {
  display: block;
  object-fit: cover;
  border-radius: 50%;
  pointer-events: none;
}
.type-icon-emoji {
  line-height: 1;
  pointer-events: none;
}
</style>
