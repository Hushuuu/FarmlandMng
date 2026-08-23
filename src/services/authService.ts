import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export const authService = {
  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signUp(email: string, password: string, displayName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  onAuthChange(cb: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      cb(event, session)
    })
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return (data as Profile) ?? null
  },

  async updateDisplayName(userId: string, name: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId)
    if (error) throw error
  },
}
