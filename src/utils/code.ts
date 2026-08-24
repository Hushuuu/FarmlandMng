/** 使用者不需關注代碼欄位，系統自動產生（如 ORCH-K7M2） */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function random4(): string {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return s
}

export function genCode(prefix: string): string {
  return `${prefix}-${random4()}`
}
