const configuredPassword = (import.meta.env.VITE_MANAGEMENT_PASSWORD ?? '').trim()
let unlocked = false

export const managementService = {
  isConfigured(): boolean {
    return configuredPassword.length > 0
  },

  isUnlocked(): boolean {
    return unlocked
  },

  unlock(password: string): boolean {
    if (!configuredPassword) {
      throw new Error('尚未設定管理密碼，請先在 .env 設定 VITE_MANAGEMENT_PASSWORD')
    }
    unlocked = password === configuredPassword
    return unlocked
  },

  lock(): void {
    unlocked = false
  },

  assertUnlocked(): void {
    if (!unlocked) throw new Error('請先在系統設定解鎖管理功能')
  },
}
