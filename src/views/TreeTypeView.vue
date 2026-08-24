<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  NButton,
  NCard,
  NColorPicker,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSpin,
  NSwitch,
  useMessage,
} from 'naive-ui'
import { useMasterStore } from '../stores/tree'
import { genCode } from '../utils/code'
import type { TreeType } from '../types/database'

const masterStore = useMasterStore()
const message = useMessage()

const loading = ref(false)
const showForm = ref(false)
const editing = ref<TreeType | null>(null)
const saving = ref(false)
const form = ref({
  code: '',
  name: '',
  description: '',
  icon: '🌳',
  color: '#4caf50',
  sort_order: 0,
  active: true,
})

function openCreate() {
  editing.value = null
  form.value = { code: '', name: '', description: '', icon: '🌳', color: '#4caf50', sort_order: (masterStore.treeTypes.at(-1)?.sort_order ?? 0) + 1, active: true }
  showForm.value = true
}

function openEdit(t: TreeType) {
  editing.value = t
  form.value = {
    code: t.code,
    name: t.name,
    description: t.description ?? '',
    icon: t.icon ?? '🌳',
    color: t.color ?? '#4caf50',
    sort_order: t.sort_order,
    active: t.active,
  }
  showForm.value = true
}

async function save() {
  if (!form.value.name) {
    message.warning('請填寫名稱')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await masterStore.updateTreeType(editing.value.id, { ...form.value })
      message.success('已更新')
    } else {
      await masterStore.createTreeType({ ...form.value, code: genCode('TT') })
      message.success('已新增')
    }
    showForm.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

async function toggleActive(t: TreeType, val: boolean) {
  try {
    await masterStore.updateTreeType(t.id, { active: val })
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await masterStore.loadAll(true)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">果樹類型</h1>
      <n-button type="primary" size="small" @click="openCreate">＋ 新增類型</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!masterStore.treeTypes.length" description="尚無資料" style="padding: 40px 0" />
      <div class="list">
        <n-card v-for="t in masterStore.treeTypes" :key="t.id" size="small">
          <div class="row-main">
            <div class="icon-badge" :style="{ background: `${t.color}22`, borderColor: t.color ?? '#ccc' }">
              {{ t.icon }}
            </div>
            <div class="info">
              <div class="name">{{ t.name }}</div>
              <div class="muted">{{ t.description || '' }}</div>
            </div>
            <div class="actions">
              <n-switch size="small" :value="t.active" @update:value="(v: boolean) => toggleActive(t, v)" />
              <n-button size="tiny" quaternary @click="openEdit(t)">編輯</n-button>
            </div>
          </div>
        </n-card>
      </div>
    </n-spin>

    <n-modal v-model:show="showForm" preset="card" :title="editing ? '編輯果樹類型' : '新增果樹類型'" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="名稱" required>
          <n-input v-model:value="form.name" placeholder="例如：芒果" />
        </n-form-item>
        <n-form-item label="說明">
          <n-input v-model:value="form.description" type="textarea" :rows="2" />
        </n-form-item>
        <div class="pair-row">
          <n-form-item label="圖示（地圖用）">
            <n-input v-model:value="form.icon" placeholder="🌳" />
          </n-form-item>
          <n-form-item label="顏色">
            <n-color-picker v-model:value="form.color" :swatches="['#4caf50', '#f0a020', '#2080f0', '#d03050', '#7b8085']" />
          </n-form-item>
        </div>
        <n-form-item label="排序">
          <n-input-number v-model:value="form.sort_order" style="width: 100%" />
        </n-form-item>
        <n-form-item label="啟用">
          <n-switch v-model:value="form.active" />
        </n-form-item>
        <n-button block type="primary" :loading="saving" @click="save">儲存</n-button>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 14.5px;
  font-weight: 700;
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pair-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
</style>
