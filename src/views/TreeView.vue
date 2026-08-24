<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDatePicker,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import { orchardService } from '../services/orchardService'
import { treeService } from '../services/treeService'
import type { Area, Orchard, Tree, TreeStatus } from '../types/database'
import { TREE_STATUS_META } from '../constants/status'
import { formatDate } from '../utils/date'
import { useMasterStore } from '../stores/tree'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const masterStore = useMasterStore()

interface Row extends Tree {
  area: Pick<Area, 'id' | 'name' | 'code' | 'orchard_id'> | null
}

const loading = ref(true)
const rows = ref<Row[]>([])
const orchards = ref<Orchard[]>([])
const keyword = ref('')
const orchardFilter = ref<string | null>(null)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (orchardFilter.value && r.area?.orchard_id !== orchardFilter.value) return false
    if (!kw) return true
    return (
      r.code.toLowerCase().includes(kw) ||
      (r.name ?? '').toLowerCase().includes(kw) ||
      (masterStore.treeTypeName(r.tree_type_id) ?? '').toLowerCase().includes(kw)
    )
  })
})

function orchardName(orchardId: string | null | undefined): string {
  if (!orchardId) return '-'
  return orchards.value.find((o) => o.id === orchardId)?.name ?? '-'
}

// ------------------------------------------------------------
// 編輯果樹
// ------------------------------------------------------------
const showForm = ref(false)
const saving = ref(false)
const editing = ref<Row | null>(null)
const form = ref({
  code: '',
  name: '',
  tree_type_id: null as string | null,
  status: 'NORMAL' as TreeStatus,
  planted_at: null as number | null,
  note: '',
})

function openEdit(r: Row) {
  editing.value = r
  form.value = {
    code: r.code,
    name: r.name ?? '',
    tree_type_id: r.tree_type_id,
    status: r.status,
    planted_at: r.planted_at ? new Date(r.planted_at).getTime() : null,
    note: r.note ?? '',
  }
  showForm.value = true
}

async function save() {
  saving.value = true
  try {
    const d = form.value.planted_at ? new Date(form.value.planted_at) : null
    await treeService.update(editing.value!.id, {
      name: form.value.name || null,
      tree_type_id: form.value.tree_type_id,
      status: form.value.status,
      planted_at: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null,
      note: form.value.note || null,
    })
    message.success('已更新')
    showForm.value = false
    await reload()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

function confirmDelete(r: Row) {
  dialog.warning({
    title: '刪除果樹',
    content: `確定停用「${r.name || r.code}」？歷史任務紀錄保留。`,
    positiveText: '停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await treeService.softDelete(r.id)
        message.success('已停用')
        await reload()
      } catch (e) {
        message.error(e instanceof Error ? e.message : '刪除失敗')
      }
    },
  })
}

async function reload() {
  rows.value = await treeService.listWithLocation(true)
}

onMounted(async () => {
  try {
    await Promise.all([reload(), masterStore.loadAll(), orchardService.list().then((list) => (orchards.value = list))])
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="head-row">
      <h1 class="page-title">果樹管理</h1>
      <n-button size="small" secondary @click="router.push('/orchards')">從地圖新增果樹 →</n-button>
    </div>

    <div class="filter-row">
      <n-select
        v-model:value="orchardFilter"
        :options="orchards.map((o) => ({ label: o.name, value: o.id }))"
        placeholder="全部果園"
        clearable
        size="small"
      />
      <n-input v-model:value="keyword" placeholder="搜尋編號 / 名稱 / 類型" clearable size="small" />
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!filtered.length && !loading" description="沒有符合的果樹" style="padding: 40px 0" />
      <div class="tree-list">
        <n-card v-for="r in filtered" :key="r.id" size="small" class="tree-item">
          <div class="row-main">
            <div class="row-info">
              <div class="name">
                {{ r.name || r.code }}
                <n-tag v-if="r.status !== 'NORMAL'" size="tiny" type="warning" round>
                  {{ TREE_STATUS_META[r.status].label }}
                </n-tag>
                <n-tag v-if="!r.active" size="tiny" type="error" round>已停用</n-tag>
              </div>
              <div class="muted">
                {{ orchardName(r.area?.orchard_id) }} / {{ r.area?.name ?? '-' }} ·
                {{ masterStore.treeTypeName(r.tree_type_id) ?? '未設定類型' }}
              </div>
              <div v-if="r.planted_at" class="muted">種植：{{ formatDate(r.planted_at) }}</div>
            </div>
            <div class="row-actions">
              <n-button size="tiny" quaternary type="primary" @click="router.push(`/tasks/history?tree=${r.id}`)">
                任務歷史
              </n-button>
              <n-button size="tiny" quaternary @click="openEdit(r)">編輯</n-button>
              <n-button v-if="r.active" size="tiny" quaternary type="error" @click="confirmDelete(r)">停用</n-button>
            </div>
          </div>
        </n-card>
      </div>
    </n-spin>

    <n-modal v-model:show="showForm" preset="card" title="編輯果樹" style="max-width: 400px">
      <n-form label-placement="top">
        <n-form-item label="名稱">
          <n-input v-model:value="form.name" placeholder="選填" />
        </n-form-item>
        <n-form-item label="果樹類型">
          <n-select v-model:value="form.tree_type_id" :options="masterStore.treeTypeOptions" clearable />
        </n-form-item>
        <n-form-item label="狀態">
          <n-select
            v-model:value="form.status"
            :options="(Object.keys(TREE_STATUS_META) as TreeStatus[]).map((s) => ({ label: TREE_STATUS_META[s].label, value: s }))"
          />
        </n-form-item>
        <n-form-item label="種植日期">
          <n-date-picker v-model:value="form.planted_at" type="date" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="備註">
          <n-input v-model:value="form.note" type="textarea" :rows="2" />
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

.filter-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

@media (max-width: 560px) {
  .filter-row {
    grid-template-columns: 1fr;
  }
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 14.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
