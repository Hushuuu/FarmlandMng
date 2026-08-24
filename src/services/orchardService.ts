import { supabase } from '../lib/supabase'
import type { Area, Orchard, SystemSetting } from '../types/database'

export const orchardService = {
  async list(includeInactive = false): Promise<Orchard[]> {
    let q = supabase.from('orchards').select('*').order('code')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Orchard[]
  },

  async get(id: string): Promise<Orchard | null> {
    const { data, error } = await supabase.from('orchards').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as Orchard) ?? null
  },

  async create(input: Partial<Orchard>): Promise<Orchard> {
    const { data, error } = await supabase.from('orchards').insert(input).select().single()
    if (error) throw error
    return data as Orchard
  },

  async update(id: string, input: Partial<Orchard>): Promise<void> {
    const { error } = await supabase.from('orchards').update(input).eq('id', id)
    if (error) throw error
  },

  /** 軟刪除（§60） */
  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false })
  },
}

export const areaService = {
  async listAll(): Promise<Area[]> {
    const { data, error } = await supabase
      .from('areas')
      .select('*')
      .eq('active', true)
      .order('code')
    if (error) throw error
    return (data ?? []) as Area[]
  },

  async listByOrchard(orchardId: string, includeInactive = false): Promise<Area[]> {
    let q = supabase.from('areas').select('*').eq('orchard_id', orchardId).order('code')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Area[]
  },

  async get(id: string): Promise<Area | null> {
    const { data, error } = await supabase.from('areas').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as Area) ?? null
  },

  async create(input: Partial<Area>): Promise<Area> {
    const { data, error } = await supabase.from('areas').insert(input).select().single()
    if (error) throw error
    return data as Area
  },

  async update(id: string, input: Partial<Area>): Promise<void> {
    const { error } = await supabase.from('areas').update(input).eq('id', id)
    if (error) throw error
  },

  async updatePosition(id: string, x: number, y: number): Promise<void> {
    const { error } = await supabase
      .from('areas')
      .update({ position_x: Math.round(x), position_y: Math.round(y) })
      .eq('id', id)
    if (error) throw error
  },

  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false })
  },
}

export const settingsService = {
  async getAll(): Promise<SystemSetting[]> {
    const { data, error } = await supabase.from('system_settings').select('*').order('key')
    if (error) throw error
    return (data ?? []) as SystemSetting[]
  },

  async getNumber(key: string, fallback: number): Promise<number> {
    const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle()
    const n = Number(data?.value)
    return Number.isFinite(n) && n > 0 ? n : fallback
  },

  async update(key: string, value: string): Promise<void> {
    const { error } = await supabase.from('system_settings').update({ value }).eq('key', key)
    if (error) throw error
  },
}
