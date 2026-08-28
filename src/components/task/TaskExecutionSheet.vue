<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NEmpty,
  NProgress,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { useTaskStore } from '../../stores/task'
import { ITEM_STATUS_META } from '../../constants/status'
import type { ItemStatus } from '../../types/database'
import TaskExecutionMap from './TaskExecutionMap.vue'

const store = useTaskStore()
const message = useMessage()
const dialog = useDialog()

const show = computed(() => !!store.activeBatch && store.executionSheetOpen)

const total = computed(() => store.activeItems.length)
const doneCount = computed(
  () => store.activeItems.filter((i) => i.status === 'COMPLETED' || i.status === 'SKIPPED').length,
)
const pendingCount = computed(() => total.value - doneCount.value)

/** 清單篩選 */
type ListFilter = 'ALL' | 'OPEN' | 'DONE'
const filter = ref<ListFilter>('ALL')
const viewMode = ref<'LIST' | 'MAP'>('MAP')

watch(
  () => store.activeBatch?.id,
  () => {
    viewMode.value = 'MAP'
    filter.value = 'ALL'
  },
)

const openItems = computed(() =>
  store.activeItems.filter((i) => i.status === 'PENDING' || i.status === 'FAILED'),
)
const visibleItems = computed(() => {
  if (filter.value === 'OPEN') return openItems.value
  if (filter.value === 'DONE')
    return store.activeItems.filter((i) => i.status === 'COMPLETED' || i.status === 'SKIPPED')
  return store.activeItems
})

function treeLabel(tree: { code: string; name: string | null } | null): string {
  if (!tree) return '?'
  return tree.name ? `${tree.name}（${tree.code}）` : tree.code
}

async function setStatus(id: string, status: ItemStatus) {
  try {
    await store.toggleItem(id, status)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

async function tapItem(id: string, status: ItemStatus) {
  await setStatus(id, status === 'PENDING' ? 'COMPLETED' : 'PENDING')
}

// ------------------------------------------------------------
// 範圍操作：依清單順序一次處理連續區段
// ------------------------------------------------------------
function indexOfItem(id: string): number {
  return store.activeItems.findIndex((i) => i.id === id)
}

/** 完成到此項：此項（含）之前所有未完成 → 完成 */
async function completeUntil(itemId: string) {
  const idx = indexOfItem(itemId)
  if (idx < 0) return
  const targets = store.activeItems.slice(0, idx + 1).filter((i) => i.status !== 'COMPLETED')
  if (!targets.length) {
    message.info('此項之前皆已完成')
    return
  }
  try {
    for (const t of targets) await store.toggleItem(t.id, 'COMPLETED')
    message.success(`已完成 ${targets.length} 項`)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

/** 此項之後全部重設待執行 */
async function resetAfter(itemId: string) {
  const idx = indexOfItem(itemId)
  if (idx < 0) return
  const targets = store.activeItems.slice(idx + 1).filter((i) => i.status !== 'PENDING')
  if (!targets.length) {
    message.info('此項之後皆為待執行')
    return
  }
  try {
    for (const t of targets) await store.toggleItem(t.id, 'PENDING')
    message.success(`已重設 ${targets.length} 項`)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

function itemOptions(): DropdownOption[] {
  return [
    { label: '標記完成', key: 'COMPLETED' },
    { label: '略過', key: 'SKIPPED' },
    { label: '執行失敗', key: 'FAILED' },
    { label: '重設為待執行', key: 'PENDING' },
    { type: 'divider', key: 'd1' },
    { label: '✓ 完成到此項（含之前的未完成）', key: 'UNTIL_DONE' },
    { label: '↺ 此項之後全部重設待執行', key: 'AFTER_RESET' },
  ]
}

async function onMenu(key: string, itemId: string, current: ItemStatus) {
  if (key === 'UNTIL_DONE') return completeUntil(itemId)
  if (key === 'AFTER_RESET') return resetAfter(itemId)
  const status = key as ItemStatus
  if (status === current) return
  await setStatus(itemId, status)
}

function confirmCompleteAll() {
  dialog.warning({
    title: '全部完成',
    content: `將剩餘 ${pendingCount.value} 項全部標記為完成？`,
    positiveText: '確定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.completeAll()
        message.success('剩餘項目已全部完成')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '更新失敗')
      }
    },
  })
}

function confirmFinish() {
  const partial = pendingCount.value > 0 && doneCount.value > 0
  const none = doneCount.value === 0
  dialog.warning({
    title: '完成本輪任務',
    content: none
      ? '目前沒有任何已完成項目，確定直接結束本輪？'
      : partial
        ? `尚有 ${pendingCount.value} 項未處理，結束後本輪將以「部分完成」紀錄。`
        : '所有項目皆已處理，確定完成本輪任務？',
    positiveText: '確定完成',
    negativeText: '繼續執行',
    onPositiveClick: async () => {
      try {
        await store.finishExecution()
        message.success('本輪任務已完成，下次執行日期已更新')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '完成任務失敗')
      }
    },
  })
}

function confirmReset() {
  dialog.warning({
    title: '重置本輪',
    content: '重置後本輪執行批次、逐樹進度與本輪展延日期都會刪除，並依原週期重新回到待執行。確定重置？',
    positiveText: '重置本輪',
    negativeText: '返回',
    onPositiveClick: async () => {
      try {
        await store.resetExecution()
        message.success('本輪已重置')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '重置失敗')
      }
    },
  })
}

function closeSheet() {
  store.closeExecutionSheet()
}
</script>

<template>
  <n-drawer
    :show="show"
    placement="bottom"
    height="95%"
    :auto-focus="false"
    @update:show="(value: boolean) => { if (!value) closeSheet() }"
  >
    <n-drawer-content body-content-style="padding:0" closable @close="closeSheet">
      <template #header>
        <div class="sheet-header">
          <div class="title">執行任務 - {{ store.activeBatchTargetName }}</div>
        </div>
      </template>

      <n-spin :show="store.executing">
        <div v-if="store.activeBatch" class="exec-body">
          <div class="progress-card">
            <n-progress
              type="line"
              :percentage="store.progress"
              :height="12"
              :border-radius="6"
              indicator-placement="inside"
              color="#18a058"
            />
            <div class="progress-text">
              {{ doneCount }} / {{ total }}
              <span class="muted">　剩餘 {{ pendingCount }} 項</span>
            </div>
            <div class="actions">
              <n-button size="small" secondary :disabled="pendingCount === 0" @click="confirmCompleteAll">
                全部完成
              </n-button>
              <n-button size="small" secondary type="warning" @click="confirmReset">重置本輪</n-button>
              <n-button size="small" secondary @click="closeSheet">關閉</n-button>
              <n-button size="small" type="primary" @click="confirmFinish">完成本輪</n-button>
            </div>
          </div>

          <n-empty v-if="!total" description="沒有可執行項目" style="margin-top: 40px" />

          <template v-else>
            <div class="view-switch">
              <button :class="{ on: viewMode === 'LIST' }" @click="viewMode = 'LIST'">清單勾選</button>
              <button :class="{ on: viewMode === 'MAP' }" @click="viewMode = 'MAP'">地圖勾選</button>
            </div>

            <task-execution-map v-if="viewMode === 'MAP'" :items="store.activeItems" />

            <template v-else>
              <!-- <div class="list-filter">
                <button :class="{ on: filter === 'ALL' }" @click="filter = 'ALL'">全部 {{ total }}</button>
                <button :class="{ on: filter === 'OPEN' }" @click="filter = 'OPEN'">未處理 {{ openItems.length }}</button>
                <button :class="{ on: filter === 'DONE' }" @click="filter = 'DONE'">已處理 {{ doneCount }}</button>
              </div> -->

              <div class="item-list">
                <div
                  v-for="item in visibleItems"
                  :key="item.id"
                  class="exec-item"
                  :class="{ done: item.status === 'COMPLETED', skipped: item.status === 'SKIPPED', failed: item.status === 'FAILED' }"
                  @click="tapItem(item.id, item.status)"
                >
                  <div class="check">
                    <span v-if="item.status === 'COMPLETED'" class="mark ok">✓</span>
                    <span v-else-if="item.status === 'SKIPPED'" class="mark skip">↷</span>
                    <span v-else-if="item.status === 'FAILED'" class="mark fail">✕</span>
                    <span v-else class="mark pending">○</span>
                  </div>
                  <div class="info">
                    <div class="name">{{ treeLabel(item.tree) }}</div>
                    <div v-if="item.note" class="note muted">{{ item.note }}</div>
                  </div>
                  <n-tag size="tiny" :type="ITEM_STATUS_META[item.status].type" round>
                    {{ ITEM_STATUS_META[item.status].label }}
                  </n-tag>
                  <n-dropdown
                    trigger="click"
                    :options="itemOptions()"
                    @select="(key: string) => onMenu(key, item.id, item.status)"
                  >
                    <button class="more-btn" @click.stop>⋯</button>
                  </n-dropdown>
                </div>

                <div v-if="!visibleItems.length" class="muted empty-filter">此分類沒有項目</div>
              </div>
            </template>
          </template>

          <div class="bottom-space" />
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.sheet-header .title {
  font-size: 16px;
  font-weight: 700;
}

.exec-body {
  padding: 12px 16px;
}

.progress-card {
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 5;
}

.progress-text {
  font-size: 15px;
  font-weight: 700;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.list-filter {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.view-switch {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.view-switch button {
  flex: 1;
  padding: 7px 0;
  border: 1px solid #e0e3e8;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #555b61;
  cursor: pointer;
}

.view-switch button.on {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 700;
  background: rgba(24, 160, 88, 0.07);
}

.list-filter button {
  flex: 1;
  padding: 7px 0;
  border: 1px solid #e0e3e8;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #555b61;
  cursor: pointer;
}

.list-filter button.on {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 700;
  background: rgba(24, 160, 88, 0.07);
}

.item-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-filter {
  text-align: center;
  padding: 20px 0;
}

.exec-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}

.exec-item.done {
  opacity: 0.75;
}

.exec-item.done .check .ok {
  color: var(--primary);
}

.exec-item.skipped .check .skip {
  color: #f0a020;
}

.exec-item.failed .check .fail {
  color: #d03050;
}

.check {
  width: 24px;
  display: flex;
  justify-content: center;
}

.mark {
  font-size: 17px;
  font-weight: 700;
}

.mark.pending {
  color: #b9bec4;
}

.info {
  flex: 1;
  min-width: 0;
}

.info .name {
  font-size: 14px;
  font-weight: 600;
}

.more-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  color: #8a8f96;
  cursor: pointer;
  padding: 2px 4px;
}

.bottom-space {
  height: 24px;
}
</style>
