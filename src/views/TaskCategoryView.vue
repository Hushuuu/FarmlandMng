<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSpin,
  NSwitch,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { useMasterStore } from '../stores/tree'
import { genCode } from '../utils/code'
import type { TaskCategory } from '../types/database'
import { useManagementStore } from '../stores/management'

const masterStore = useMasterStore()
const message = useMessage()
const dialog = useDialog()
const management = useManagementStore()

const loading = ref(false)
const showForm = ref(false)
const editing = ref<TaskCategory | null>(null)
const saving = ref(false)
const form = ref({ code: '', name: '', description: '', sort_order: 0, active: true })

function openCreate() {
  editing.value = null
  form.value = {
    code: '',
    name: '',
    description: '',
    sort_order: (masterStore.taskCategories.at(-1)?.sort_order ?? 0) + 1,
    active: true,
  }
  showForm.value = true
}

function openEdit(c: TaskCategory) {
  editing.value = c
  form.value = {
    code: c.code,
    name: c.name,
    description: c.description ?? '',
    sort_order: c.sort_order,
    active: c.active,
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
      await masterStore.updateCategory(editing.value.id, { ...form.value })
      message.success('已更新')
    } else {
      await masterStore.createCategory({ ...form.value, code: genCode('TC') })
      message.success('已新增')
    }
    showForm.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

async function toggleActive(c: TaskCategory, val: boolean) {
  try {
    await masterStore.updateCategory(c.id, { active: val })
  } catch (e) {
    message.error(e instanceof Error ? e.message : '更新失敗')
  }
}

function confirmHardDelete(c: TaskCategory) {
  dialog.error({
    title: '永久刪除任務類別',
    content: `將永久刪除「${c.name}」；使用此類別的任務會改為未分類，且無法復原。確定繼續？`,
    positiveText: '永久刪除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await masterStore.hardDeleteCategory(c.id)
        message.success('任務類別已永久刪除')
      } catch (e) {
        message.error(e instanceof Error ? e.message : '永久刪除失敗')
      }
    },
  })
}

onMounted(async () => {
  loading.value = true
  try {
    await masterStore.loadAll(true, true)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">任務類別</h1>
      <n-button type="primary" size="small" @click="openCreate">＋ 新增類別</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!masterStore.taskCategories.length" description="尚無資料" style="padding: 40px 0" />
      <div class="list">
        <n-card v-for="c in masterStore.taskCategories" :key="c.id" size="small">
          <div class="row-main">
            <div class="info">
              <div class="name">
                {{ c.name }}
                <n-tag v-if="!c.active" size="tiny" type="error" round>已停用</n-tag>
              </div>
              <div class="muted">{{ c.description || '' }}</div>
            </div>
            <div class="actions">
              <n-switch size="small" :value="c.active" @update:value="(v: boolean) => toggleActive(c, v)" />
              <n-button size="tiny" quaternary @click="openEdit(c)">編輯</n-button>
              <n-button v-if="management.unlocked" size="tiny" quaternary type="error" @click="confirmHardDelete(c)">
                永久刪除
              </n-button>
            </div>
          </div>
        </n-card>
      </div>
    </n-spin>

    <n-modal v-model:show="showForm" preset="card" :title="editing ? '編輯任務類別' : '新增任務類別'" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="名稱" required>
          <n-input v-model:value="form.name" placeholder="例如：施肥" />
        </n-form-item>
        <n-form-item label="說明">
          <n-input v-model:value="form.description" type="textarea" :rows="2" />
        </n-form-item>
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
  justify-content: space-between;
  gap: 12px;
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
</style>
