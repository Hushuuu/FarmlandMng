<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NForm, NFormItem, NIcon, NInput, useMessage } from 'naive-ui'
import { ParkOutlined } from '@vicons/material'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const message = useMessage()

const email = ref('')
const password = ref('')
const displayName = ref('')
const mode = ref<'signin' | 'signup'>('signin')
const loading = ref(false)

function getRedirectPath(): string {
  const redirect = route.query.redirect
  return typeof redirect === 'string' ? redirect : '/'
}

async function submit() {
  const normalizedEmail = email.value.trim()
  if (!normalizedEmail || !password.value) {
    message.warning('請輸入 Email 與密碼')
    return
  }
  loading.value = true
  try {
    if (mode.value === 'signup') {
      const { session } = await auth.signUp(normalizedEmail, password.value, displayName.value.trim() || undefined)
      if (session) {
        message.success('註冊成功，已自動登入')
        await router.replace(getRedirectPath())
      } else {
        message.success('註冊成功，請直接登入')
        password.value = ''
        mode.value = 'signin'
      }
    } else {
      await auth.signIn(normalizedEmail, password.value)
      await router.replace(getRedirectPath())
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : mode.value === 'signup' ? '註冊失敗' : '登入失敗')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <n-card class="login-card" :bordered="false">
      <div class="brand-row">
        <n-icon size="34" color="#18a058"><ParkOutlined /></n-icon>
        <div class="brand-title">果園管理系統</div>
        <div class="muted">Orchard Management System</div>
      </div>

      <n-form label-placement="top" @keyup.enter="submit">
        <template v-if="mode === 'signup'">
          <n-form-item label="顯示名稱">
            <n-input v-model:value="displayName" placeholder="選填" />
          </n-form-item>
        </template>
        <n-form-item label="Email">
          <n-input v-model:value="email" placeholder="email@example.com" />
        </n-form-item>
        <n-form-item label="密碼">
          <n-input v-model:value="password" type="password" show-password-on="click" placeholder="密碼" />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="submit">
          {{ mode === 'signup' ? '註冊' : '登入' }}
        </n-button>
        <div class="switch-row muted clickable" @click="mode = mode === 'signup' ? 'signin' : 'signup'">
          {{ mode === 'signup' ? '已有帳號？回到登入' : '還沒有帳號？註冊新帳號' }}
        </div>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.login-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(160deg, #e8f5ee 0%, #f5f6f8 60%);
  padding: 16px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  border-radius: 14px;
}

.brand-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 20px;
}

.brand-title {
  font-size: 20px;
  font-weight: 700;
}

.switch-row {
  text-align: center;
  margin-top: 14px;
  user-select: none;
}
</style>
