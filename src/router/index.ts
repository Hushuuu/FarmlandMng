import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true, title: '登入' },
    },
    { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard' } },
    { path: '/orchards', name: 'orchard-list', component: () => import('../views/OrchardListView.vue'), meta: { title: '果園列表' } },
    {
      path: '/orchards/:orchardId/map',
      name: 'orchard-map',
      component: () => import('../views/OrchardMapView.vue'),
      meta: { title: '果園地圖', fullscreen: true },
    },
    {
      path: '/orchards/:orchardId/areas/:areaId',
      name: 'area-map',
      component: () => import('../views/AreaMapView.vue'),
      meta: { title: '區域地圖', fullscreen: true },
    },
    { path: '/trees', name: 'trees', component: () => import('../views/TreeView.vue'), meta: { title: '果樹管理' } },
    { path: '/tree-types', name: 'tree-types', component: () => import('../views/TreeTypeView.vue'), meta: { title: '果樹類型' } },
    {
      path: '/task-categories',
      name: 'task-categories',
      component: () => import('../views/TaskCategoryView.vue'),
      meta: { title: '任務類別' },
    },
    { path: '/tasks', name: 'tasks', component: () => import('../views/TaskView.vue'), meta: { title: '任務設定' } },
    {
      path: '/tasks/pending',
      name: 'tasks-pending',
      component: () => import('../views/PendingTasksView.vue'),
      meta: { title: '待執行任務' },
    },
    {
      path: '/tasks/executions',
      name: 'tasks-executions',
      component: () => import('../views/ExecutionsView.vue'),
      meta: { title: '執行紀錄' },
    },
    {
      path: '/tasks/history',
      name: 'tasks-history',
      component: () => import('../views/HistoryView.vue'),
      meta: { title: '任務歷史' },
    },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '系統設定' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }
})

export default router
