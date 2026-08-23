<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NConfigProvider,
  NDialogProvider,
  NDrawer,
  NDrawerContent,
  NIcon,
  NLayout,
  NLayoutSider,
  NMessageProvider,
  zhTW,
  dateZhTW,
} from 'naive-ui'
import type { Component } from 'vue'
import {
  HomeOutlined,
  MapOutlined,
  ParkOutlined,
  TaskAltOutlined,
  SettingsOutlined,
  MenuOutlined,
  LogOutOutlined,
  EcoOutlined,
  ChecklistOutlined,
  HistoryOutlined,
  CategoryOutlined,
} from '@vicons/material'
import { useAuthStore } from './stores/auth'
import TaskExecutionSheet from './components/task/TaskExecutionSheet.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const showMenu = ref(false)

interface MenuItem {
  label: string
  to: string
  icon?: Component
}
interface MenuGroup {
  title: string
  items: MenuItem[]
}

const menuGroups = computed<MenuGroup[]>(() => [
  {
    title: '總覽',
    items: [{ label: 'Dashboard', to: '/', icon: HomeOutlined }],
  },
  {
    title: '果園管理',
    items: [
      { label: '果園列表', to: '/orchards', icon: ParkOutlined },
      { label: '果樹管理', to: '/trees', icon: EcoOutlined },
    ],
  },
  {
    title: '基本資料',
    items: [
      { label: '果樹類型', to: '/tree-types', icon: CategoryOutlined },
      { label: '任務類別', to: '/task-categories', icon: CategoryOutlined },
    ],
  },
  {
    title: '任務管理',
    items: [
      { label: '任務設定', to: '/tasks', icon: ChecklistOutlined },
      { label: '待執行任務', to: '/tasks/pending', icon: TaskAltOutlined },
      { label: '執行紀錄', to: '/tasks/executions', icon: ChecklistOutlined },
      { label: '任務歷史', to: '/tasks/history', icon: HistoryOutlined },
    ],
  },
  {
    title: '系統',
    items: [{ label: '設定', to: '/settings', icon: SettingsOutlined }],
  },
])

const bottomNav = [
  { label: '總覽', to: '/', icon: HomeOutlined },
  { label: '果園', to: '/orchards', icon: ParkOutlined },
  { label: '任務', to: '/tasks/pending', icon: TaskAltOutlined },
]

const pageTitle = computed(() => (route.meta.title as string) ?? '')

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(to + '/')
}

async function handleLogout() {
  showMenu.value = false
  await auth.signOut()
  router.replace({ name: 'login' })
}

function go(to: string) {
  showMenu.value = false
  router.push(to)
}
</script>

<template>
  <n-config-provider :locale="zhTW" :date-locale="dateZhTW">
    <n-message-provider>
      <n-dialog-provider>
        <router-view v-if="route.name === 'login'" />
        <div v-else class="app-shell">
          <!-- Desktop Sidebar -->
          <n-layout has-sider class="desktop-layout" content-style="height:100%">
            <n-layout-sider
              bordered
              collapse-mode="width"
              :width="224"
              :native-scrollbar="false"
              class="sidebar"
            >
              <div class="brand">
                <n-icon size="22" color="#18a058"><ParkOutlined /></n-icon>
                <span>果園管理系統</span>
              </div>
              <div class="menu-scroll">
                <div v-for="group in menuGroups" :key="group.title" class="menu-group">
                  <div class="menu-group-title">{{ group.title }}</div>
                  <div
                    v-for="item in group.items"
                    :key="item.to"
                    class="menu-item"
                    :class="{ active: isActive(item.to) }"
                    @click="go(item.to)"
                  >
                    <n-icon v-if="item.icon" size="17"><component :is="item.icon" /></n-icon>
                    <span>{{ item.label }}</span>
                  </div>
                </div>
              </div>
              <div class="sidebar-footer">
                <span class="muted">{{ auth.displayName }}</span>
                <n-button quaternary size="tiny" @click="handleLogout">登出</n-button>
              </div>
            </n-layout-sider>

            <n-layout-content class="desktop-content">
              <router-view />
            </n-layout-content>
          </n-layout>

          <!-- Mobile -->
          <header class="mobile-header">
            <span class="mobile-title">{{ pageTitle || '果園管理系統' }}</span>
            <n-button quaternary circle size="small" @click="showMenu = true">
              <template #icon><n-icon><MenuOutlined /></n-icon></template>
            </n-button>
          </header>

          <main class="mobile-main">
            <router-view />
          </main>

          <nav class="bottom-nav">
            <div
              v-for="item in bottomNav"
              :key="item.to"
              class="bottom-nav-item"
              :class="{ active: isActive(item.to) }"
              @click="go(item.to)"
            >
              <n-icon size="20"><component :is="item.icon" /></n-icon>
              <span>{{ item.label }}</span>
            </div>
            <div class="bottom-nav-item" :class="{ active: showMenu }" @click="showMenu = true">
              <n-icon size="20"><MapOutlined /></n-icon>
              <span>更多</span>
            </div>
          </nav>

          <n-drawer v-model:show="showMenu" placement="right" :width="280">
            <n-drawer-content title="選單" closable>
              <div class="menu-scroll-drawer">
                <div v-for="group in menuGroups" :key="group.title" class="menu-group">
                  <div class="menu-group-title">{{ group.title }}</div>
                  <div
                    v-for="item in group.items"
                    :key="item.to"
                    class="menu-item"
                    :class="{ active: isActive(item.to) }"
                    @click="go(item.to)"
                  >
                    <n-icon v-if="item.icon" size="17"><component :is="item.icon" /></n-icon>
                    <span>{{ item.label }}</span>
                  </div>
                </div>
              </div>
              <template #footer>
                <n-button block secondary type="error" @click="handleLogout">
                  <template #icon><n-icon><LogOutOutlined /></n-icon></template>
                  登出（{{ auth.displayName }}）
                </n-button>
              </template>
            </n-drawer-content>
          </n-drawer>

          <!-- 全域任務執行 Bottom Sheet（§34） -->
          <task-execution-sheet />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.app-shell {
  height: 100%;
}

.desktop-layout {
  display: none;
}

.mobile-header {
  display: flex;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--app-header-height);
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8eaf0;
}

.mobile-title {
  font-size: 16px;
  font-weight: 600;
}

.mobile-main {
  display: block;
  min-height: 100%;
}

.bottom-nav {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--bottom-nav-height);
  background: #fff;
  border-top: 1px solid #e8eaf0;
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
  color: #6b7075;
  cursor: pointer;
  user-select: none;
}

.bottom-nav-item.active {
  color: var(--primary);
  font-weight: 600;
}

@media (min-width: 768px) {
  .mobile-header,
  .bottom-nav,
  .mobile-main {
    display: none;
  }

  .desktop-layout {
    display: flex;
    height: 100vh;
  }

  .sidebar {
    display: flex;
  }

  .desktop-content {
    background: var(--bg);
  }
}
</style>

<style>
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-weight: 700;
  font-size: 15px;
}

.menu-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 12px;
}

.menu-scroll-drawer {
  margin: -8px 0;
}

.menu-group {
  padding: 8px 0;
}

.menu-group-title {
  padding: 4px 16px;
  font-size: 11px;
  color: #9aa0a8;
  letter-spacing: 1px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13.5px;
  color: #444;
  cursor: pointer;
  user-select: none;
}

.menu-item:hover {
  background: #f2f3f5;
}

.menu-item.active {
  background: rgba(24, 160, 88, 0.12);
  color: var(--primary);
  font-weight: 600;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid #eceef2;
}
</style>
