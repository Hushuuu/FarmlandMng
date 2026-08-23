import { supabase } from '../lib/supabase'
import type { Area, TaskCategory, Tree, TreeType } from '../types/database'

export const treeTypeService = {
  async list(includeInactive = false): Promise<TreeType[]> {
    let q = supabase.from('tree_types').select('*').order('sort_order')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as TreeType[]
  },

  async create(input: Partial<TreeType>): Promise<TreeType> {
    const { data, error } = await supabase.from('tree_types').insert(input).select().single()
    if (error) throw error
    return data as TreeType
  },

  async update(id: string, input: Partial<TreeType>): Promise<void> {
    const { error } = await supabase.from('tree_types').update(input).eq('id', id)
    if (error) throw error
  },
}

export const treeService = {
  async listByArea(areaId: string, includeInactive = false): Promise<Tree[]> {
    let q = supabase.from('trees').select('*').eq('area_id', areaId).order('code')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Tree[]
  },

  async get(id: string): Promise<Tree | null> {
    const { data, error } = await supabase.from('trees').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as Tree) ?? null
  },

  /** 取得果樹（含所屬區域/果園資訊，供果樹管理頁使用） */
  async listWithLocation(includeInactive = false): Promise<
    (Tree & { area: Pick<Area, 'id' | 'name' | 'code' | 'orchard_id'> | null })[]
  > {
    let q = supabase
      .from('trees')
      .select('*, area:areas!inner(id, name, code, orchard_id)')
      .order('code')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as (Tree & {
      area: Pick<Area, 'id' | 'name' | 'code' | 'orchard_id'> | null
    })[]
  },

  async create(input: Partial<Tree>): Promise<Tree> {
    const { data, error } = await supabase.from('trees').insert(input).select().single()
    if (error) throw error
    return data as Tree
  },

  async update(id: string, input: Partial<Tree>): Promise<void> {
    const { error } = await supabase.from('trees').update(input).eq('id', id)
    if (error) throw error
  },

  async updatePosition(id: string, x: number, y: number): Promise<void> {
    const { error } = await supabase
      .from('trees')
      .update({ position_x: Math.round(x), position_y: Math.round(y) })
      .eq('id', id)
    if (error) throw error
  },

  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false })
  },

  async countByAreas(areaIds: string[]): Promise<Record<string, number>> {
    if (!areaIds.length) return {}
    const { data, error } = await supabase
      .from('trees')
      .select('area_id')
      .in('area_id', areaIds)
      .eq('active', true)
    if (error) throw error
    const result: Record<string, number> = {}
    for (const row of data ?? []) result[row.area_id] = (result[row.area_id] ?? 0) + 1
    return result
  },
}

export const taskCategoryService = {
  async list(includeInactive = false): Promise<TaskCategory[]> {
    let q = supabase.from('task_categories').select('*').order('sort_order')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as TaskCategory[]
  },

  async create(input: Partial<TaskCategory>): Promise<TaskCategory> {
    const { data, error } = await supabase.from('task_categories').insert(input).select().single()
    if (error) throw error
    return data as TaskCategory
  },

  async update(id: string, input: Partial<TaskCategory>): Promise<void> {
    const { error } = await supabase.from('task_categories').update(input).eq('id', id)
    if (error) throw error
  },
}
