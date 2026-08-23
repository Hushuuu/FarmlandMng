<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NCollapse, NCollapseItem, NEmpty, NSpin, NTag } from 'naive-ui'
import {
  getBatchWithItems,
  getTreeHistory,
  listBatchSummaries,
} from '../services/taskService'
import type { BatchStatus, ItemStatus } from '../types/database'
import { BATCH_STATUS_META, ITEM_STATUS_META } from '../constants/status'
import { formatDateWithWeekday } from '../utils/date'

interface HistoryGroup {
  key: string
  title: string
  target: string
  date: string
  status: BatchStatus
  done: number
  total: number
}

interface DetailItem {
  id: string
  status: ItemStatus
  label: string
}

const route = useRoute()
const treeId = computed(() => (route.query.tree as string) ?? null)

const loading = ref(true)
const treeLabel = ref('')
const groups = ref<HistoryGroup[]>([])
/** batchId → 明細 */
const details = reactive(new Map<string, DetailItem[]>())

function statusMeta(s: BatchStatus) {
  return BATCH_STATUS_META[s]
}

async function load() {
  loading.value = true
  details.clear()
  groups.value = []
  try {
    if (treeId.value) {
      const { treeLabel: label, entries } = await getTreeHistory(treeId.value)
      treeLabel.value = label
      for (const e of entries) {
        const done = e.items.filter((i) => i.status === 'COMPLETED').length
        groups.value.push({
          key: e.batchId,
          title: `${e.taskName}${e.categoryName ? `（${e.categoryName}）` : ''}`,
          target: e.targetPath,
          date: e.scheduledDate,
          status: e.status,
          done,
          total: e.items.length,
        })
        details.set(
          e.batchId,
          e.items.map((i) => ({ id: i.id, status: i.status, label: label })),
        )
      }
    } else {
      const summaries = await listBatchSummaries()
      for (const b of summaries) {
        groups.value.push({
          key: b.id,
          title: `${b.taskName}${b.categoryName ? `（${b.categoryName}）` : ''}`,
          target: b.targetLabel || '—',
          date: b.scheduled_date,
          status: b.status,
          done: b.completedItems,
          total: b.totalItems,
        })
      }
    }
  } finally {
    loading.value = false
  }
}

/** 展開時才載入明細（§37） */
async function ensureDetail(keys: (string | number)[]) {
  if (treeId.value) return
  for (const k of keys) {
    const id = String(k)
    if (details.has(id)) continue
    try {
      const { items } = await getBatchWithItems(id)
      details.set(
        id,
        items.map((i) => ({
          id: i.id,
          status: i.status,
          label: i.tree ? (i.tree.name ? `${i.tree.name}（${i.tree.code}）` : i.tree.code) : '?',
        })),
      )
    } catch {
      details.set(id, [])
    }
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h1 class="page-title">{{ treeId ? `果樹歷史：${treeLabel}` : '任務歷史' }}</h1>

    <n-spin :show="loading">
      <n-empty v-if="!groups.length && !loading" description="尚無歷史紀錄" style="padding: 40px 0" />

      <n-collapse v-else display-directive="show" @update:expanded-names="ensureDetail">
        <n-collapse-item v-for="g in groups" :key="g.key" :name="g.key">
          <template #header>
            <div class="group-header">
              <div class="gh-main">
                <div class="title">{{ g.title }}</div>
                <div class="muted">{{ formatDateWithWeekday(g.date) }} · {{ g.target }}</div>
                <div class="muted" v-if="g.total">
                  {{ g.done }} / {{ g.total }}
                  {{ g.done === g.total ? '完成' : g.done === 0 ? '未完成' : '部分完成' }}
                </div>
              </div>
              <n-tag size="small" :type="statusMeta(g.status).type" round>
                {{ statusMeta(g.status).label }}
              </n-tag>
            </div>
          </template>

          <div class="detail-list">
            <div v-for="it in details.get(g.key) ?? []" :key="it.id" class="item-row">
              <span class="mark" :class="it.status.toLowerCase()">
                {{ it.status === 'COMPLETED' ? '✓' : it.status === 'SKIPPED' ? '↷' : it.status === 'FAILED' ? '✕' : '○' }}
              </span>
              <span class="tname">{{ it.label }}</span>
              <n-tag size="tiny" :type="ITEM_STATUS_META[it.status].type">
                {{ ITEM_STATUS_META[it.status].label }}
              </n-tag>
            </div>
            <div v-if="!details.get(g.key)?.length" class="muted" style="padding: 6px 0">
              無明細資料
            </div>
          </div>
        </n-collapse-item>
      </n-collapse>
    </n-spin>
  </div>
</template>

<style scoped>
.group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.gh-main {
  min-width: 0;
}

.title {
  font-size: 14.5px;
  font-weight: 700;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.mark {
  width: 16px;
  text-align: center;
  font-weight: 700;
}

.mark.completed {
  color: #18a058;
}

.mark.skipped {
  color: #f0a020;
}

.mark.failed {
  color: #d03050;
}

.mark.pending {
  color: #b9bec4;
}

.tname {
  flex: 1;
  min-width: 0;
}
</style>
