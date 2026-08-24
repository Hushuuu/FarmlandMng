import { defineStore } from 'pinia'
import { managementService } from '../services/managementService'

export const useManagementStore = defineStore('management', {
  state: () => ({
    configured: managementService.isConfigured(),
    unlocked: managementService.isUnlocked(),
  }),

  actions: {
    unlock(password: string): boolean {
      const ok = managementService.unlock(password)
      this.unlocked = ok
      return ok
    },

    lock(): void {
      managementService.lock()
      this.unlocked = false
    },
  },
})
