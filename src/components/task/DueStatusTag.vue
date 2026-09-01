<!-- 顯示任務的到期狀態 -->
<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { DueStatus } from '../../types/database'
import { DUE_STATUS_META } from '../../constants/status'

const props = defineProps<{ status: DueStatus }>()
const meta = computed(() => DUE_STATUS_META[props.status])
</script>

<template>
  <n-tag :type="meta.type" size="small" round>{{ meta.label }}</n-tag>
</template>
