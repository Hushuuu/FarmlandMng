import { supabase } from '../lib/supabase'
import type { Area, Orchard, SystemSetting } from '../types/database'
import { deleteExecutionData, listAssignmentIdsByTarget } from './hardDeleteService'
import { managementService } from './managementService'

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

  /** 管理模式專用：永久刪除果園、底下區域/果樹與相關任務紀錄。 */
  async hardDelete(id: string): Promise<void> {
    managementService.assertUnlocked()
    const { data: areaRows, error: areaError } = await supabase
      .from('areas')
      .select('id')
      .eq('orchard_id', id)
    if (areaError) throw areaError
    const areaIds = (areaRows ?? []).map((row) => row.id)

    let treeIds: string[] = []
    if (areaIds.length) {
      const { data: treeRows, error: treeError } = await supabase
        .from('trees')
        .select('id')
        .in('area_id', areaIds)
      if (treeError) throw treeError
      treeIds = (treeRows ?? []).map((row) => row.id)
    }

    const [orchardAssignmentIds, areaAssignmentIds, treeAssignmentIds] = await Promise.all([
      listAssignmentIdsByTarget('ORCHARD', [id]),
      listAssignmentIdsByTarget('AREA', areaIds),
      listAssignmentIdsByTarget('TREE', treeIds),
    ])
    const assignmentIds = [...new Set([...orchardAssignmentIds, ...areaAssignmentIds, ...treeAssignmentIds])]
    await deleteExecutionData(assignmentIds, treeIds)

    if (assignmentIds.length) {
      const { error } = await supabase.from('task_assignments').delete().in('id', assignmentIds)
      if (error) throw error
    }
    if (treeIds.length) {
      const { error } = await supabase.from('trees').delete().in('id', treeIds)
      if (error) throw error
    }
    if (areaIds.length) {
      const { error } = await supabase.from('areas').delete().in('id', areaIds)
      if (error) throw error
    }
    const { error } = await supabase.from('orchards').delete().eq('id', id)
    if (error) throw error
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

  /** 管理模式專用：永久刪除區域、底下果樹與相關任務紀錄。 */
  async hardDelete(id: string): Promise<void> {
    managementService.assertUnlocked()
    const { data: treeRows, error: treeError } = await supabase
      .from('trees')
      .select('id')
      .eq('area_id', id)
    if (treeError) throw treeError
    const treeIds = (treeRows ?? []).map((row) => row.id)

    const [areaAssignmentIds, treeAssignmentIds] = await Promise.all([
      listAssignmentIdsByTarget('AREA', [id]),
      listAssignmentIdsByTarget('TREE', treeIds),
    ])
    const assignmentIds = [...new Set([...areaAssignmentIds, ...treeAssignmentIds])]
    await deleteExecutionData(assignmentIds, treeIds)

    if (assignmentIds.length) {
      const { error } = await supabase.from('task_assignments').delete().in('id', assignmentIds)
      if (error) throw error
    }
    if (treeIds.length) {
      const { error } = await supabase.from('trees').delete().in('id', treeIds)
      if (error) throw error
    }
    const { error } = await supabase.from('areas').delete().eq('id', id)
    if (error) throw error
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
