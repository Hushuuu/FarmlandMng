import { defineStore } from 'pinia'
import { authService } from '../services/authService'
import type { Profile } from '../types/database'
import type { Session } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null as Session | null,
    profile: null as Profile | null,
    loading: true,
    initialized: false,
  }),

  getters: {
    isLoggedIn: (s) => !!s.session,
    userId: (s) => s.session?.user?.id ?? null,
    displayName: (s) => s.profile?.display_name ?? s.session?.user?.email?.split('@')[0] ?? '使用者',
  },

  actions: {
    async init() {
      if (this.initialized) return
      try {
        this.session = await authService.getSession()
        await this.loadProfile()
      } catch (e) {
        console.error('[auth] 初始化失敗，視為未登入', e)
        this.session = null
        this.profile = null
      } finally {
        authService.onAuthChange((_event, session) => {
          this.session = session
          void this.loadProfile()
        })
        this.loading = false
        this.initialized = true
      }
    },

    async loadProfile() {
      try {
        const uid = this.session?.user?.id
        this.profile = uid ? await authService.getProfile(uid) : null
      } catch (e) {
        console.error('[auth] 載入 profile 失敗', e)
        this.profile = null
      }
    },

    async signIn(email: string, password: string) {
      const data = await authService.signIn(email, password)
      if (data.session) {
        this.session = data.session
        await this.loadProfile()
      }
      return data
    },

    async signUp(email: string, password: string, displayName?: string) {
      const data = await authService.signUp(email, password, displayName)
      if (data.session) {
        this.session = data.session
        await this.loadProfile()
      }
      return data
    },

    async signOut() {
      await authService.signOut()
      this.profile = null
    },
  },
})
