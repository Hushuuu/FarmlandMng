<script setup lang="ts">
import { computed } from 'vue'
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
import { useTaskStore } from '../../stores/task'
import { ITEM_STATUS_META } from '../../constants/status'
import type { ItemStatus } from '../../types/database'

const store = useTaskStore()
const message = useMessage()
const dialog = useDialog()

const show = computed(() => !!store.activeBatch)

const total = computed(() => store.activeItems.length)
const doneCount = computed(
  () => store.activeItems.filter((i) => i.status === 'COMPLETED' || i.status === 'SKIPPED').length,
)
const pendingCount = computed(() => total.value - doneCount.value)
const allResolved = computed(() => pendingCount.value === 0)

function treeLabel(tree: { code: string; name: string | null } | null): string {
  if (!tree) return '?'
  return tree.name ? `${tree.name}（${tree.code}）` : tree.code
}

async function tapItem(id: string, status: ItemStatus) {
  try {
    if (status === 'PENDING') await store.toggleItem(id, 'COMPLETED')
    else await store.toggleItem(id, 'PENDING')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

function itemOptions(): { label: string; key: ItemStatus }[] {
  return [
    { label: '標記完成', key: 'COMPLETED' },
    { label: '略過', key: 'SKIPPED' },
    { label: '執行失敗', key: 'FAILED' },
    { label: '重設為待執行', key: 'PENDING' },
  ]
}

async function onMenu(key: ItemStatus, itemId: string, current: ItemStatus) {
  if (key === current) return
  try {
    await store.toggleItem(itemId, key)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

function confirmCompleteAll() {
  dialog.warning({
    title: '全部完成',
    content: `將剩餘 ${pendingCount.value} 項全部標記為完成？`,
    positiveText: '確定',
    negativeText: '取消',
    onPositiveClick: () => store.completeAll(),
  })
}

function confirmFinish() {
  const partial = !allResolved.value && doneCount.value > 0
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
      await store.finishExecution()
      message.success('本輪任務已完成，下次執行日期已更新')
    },
  })
}

function confirmCancel() {
  dialog.warning({
    title: '取消執行',
    content: '取消後本輪紀錄將標記為「已取消」，不會計入週期。確定取消？',
    positiveText: '取消任務',
    negativeText: '返回',
    onPositiveClick: () => store.cancelExecution(),
  })
}
</script>

<template>
  <n-drawer :show="show" placement="bottom" height="88%" :auto-focus="false" @update:show="store.clearExecution()">
    <n-drawer-content body-content-style="padding:0">
      <template #header>
        <div class="sheet-header">
          <div class="title">執行任務</div>
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
              <n-button size="small" secondary type="error" @click="confirmCancel">取消</n-button>
              <n-button size="small" type="primary" @click="confirmFinish">完成本輪</n-button>
            </div>
          </div>

          <n-empty v-if="!total" description="沒有可執行項目" style="margin-top: 40px" />

          <div v-else class="item-list">
            <div
              v-for="item in store.activeItems"
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
                @select="(key: ItemStatus) => onMenu(key, item.id, item.status)"
              >
                <button class="more-btn" @click.stop>⋯</button>
              </n-dropdown>
            </div>
          </div>

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

.item-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
