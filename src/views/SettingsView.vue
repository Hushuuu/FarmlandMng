<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NForm, NFormItem, NInput, NSpin, useMessage } from 'naive-ui'
import { settingsService } from '../services/orchardService'
import { authService } from '../services/authService'
import { supabase } from '../lib/supabase'
import type { SystemSetting } from '../types/database'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const message = useMessage()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const rows = reactive<SystemSetting[]>([])
const editingName = ref('')

onMounted(async () => {
  try {
    const [settings] = await Promise.all([settingsService.getAll(), auth.loadProfile()])
    for (const s of settings) rows.push(s)
    editingName.value = auth.profile?.display_name ?? ''
  } catch (e) {
    message.error(e instanceof Error ? e.message : '載入失敗')
  } finally {
    loading.value = false
  }
})

async function saveAll() {
  saving.value = true
  try {
    await Promise.all(rows.map((r) => settingsService.update(r.key, r.value ?? '')))
    if (auth.userId && editingName.value) {
      await authService.updateDisplayName(auth.userId, editingName.value)
      await auth.loadProfile()
    }
    message.success('已儲存設定')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '儲存失敗')
  } finally {
    saving.value = false
  }
}

async function signOut() {
  await auth.signOut()
  router.replace({ name: 'login' })
}

async function resetPassword() {
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) return
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) message.error(error.message)
  else message.success('重設密碼信件已寄出')
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">系統設定</h1>

    <n-spin :show="loading">
      <n-card title="使用者" size="small" class="block">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="Email">
            {{ auth.session?.user?.email }}
          </n-form-item>
          <n-form-item label="顯示名稱">
            <n-input v-model:value="editingName" placeholder="顯示名稱" />
          </n-form-item>
          <div class="btn-row">
            <n-button size="small" quaternary @click="resetPassword">寄送重設密碼信</n-button>
            <n-button size="small" secondary type="error" @click="signOut">登出</n-button>
          </div>
        </n-form>
      </n-card>

      <n-card title="系統參數" size="small" class="block">
        <n-form label-placement="left" label-width="180">
          <n-form-item v-for="r in rows" :key="r.key" :label="r.description || r.key">
            <div class="setting-row">
              <n-input v-model:value="r.value" />
              <span class="muted key">{{ r.key }}</span>
            </div>
          </n-form-item>
        </n-form>
      </n-card>

      <n-button block type="primary" :loading="saving" @click="saveAll">儲存設定</n-button>

      <div class="muted about">
        果園管理系統 v1.0 · Vue 3 + Naive UI + Supabase
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.key {
  white-space: nowrap;
}

.btn-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.about {
  text-align: center;
  padding: 16px 0;
}
</style>
