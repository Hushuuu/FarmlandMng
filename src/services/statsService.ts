import { supabase } from '../lib/supabase'
import type { Area, Orchard, Tree } from '../types/database'

export interface OrchardStats {
  orchard: Orchard
  areaCount: number
  treeCount: number
}

export interface AreaStats {
  area: Area
  treeCount: number
  pendingCount: number
  overdueCount: number
}

export const statsService = {
  async counts(): Promise<{ orchards: number; areas: number; trees: number }> {
    const [o, a, t] = await Promise.all([
      supabase.from('orchards').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('areas').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('trees').select('id', { count: 'exact', head: true }).eq('active', true),
    ])
    return {
      orchards: o.count ?? 0,
      areas: a.count ?? 0,
      trees: t.count ?? 0,
    }
  },

  /** 每個果園的區域/果樹統計（§14） */
  async orchardStats(): Promise<OrchardStats[]> {
    const [{ data: orchards, error: oe }, { data: areas, error: ae }, { data: trees, error: te }] =
      await Promise.all([
        supabase.from('orchards').select('*').eq('active', true).order('code'),
        supabase.from('areas').select('id, orchard_id').eq('active', true),
        supabase.from('trees').select('id, area_id, active'),
      ])
    if (oe) throw oe
    if (ae) throw ae
    if (te) throw te
    const treeCountByArea = new Map<string, number>()
    for (const t of (trees ?? []) as Pick<Tree, 'area_id' | 'active'>[]) {
      if (!t.active) continue
      treeCountByArea.set(t.area_id, (treeCountByArea.get(t.area_id) ?? 0) + 1)
    }
    return ((orchards ?? []) as Orchard[]).map((o) => {
      const orchardAreas = ((areas ?? []) as Pick<Area, 'id' | 'orchard_id'>[]).filter(
        (a) => a.orchard_id === o.id,
      )
      let treeCount = 0
      for (const a of orchardAreas) treeCount += treeCountByArea.get(a.id) ?? 0
      return { orchard: o, areaCount: orchardAreas.length, treeCount }
    })
  },

  /** 每個有效區域的果樹數，供 Dashboard 果園明細使用。 */
  async areaStats(): Promise<AreaStats[]> {
    const [{ data: areas, error: ae }, { data: trees, error: te }] = await Promise.all([
      supabase.from('areas').select('*').eq('active', true).order('orchard_id').order('code'),
      supabase.from('trees').select('area_id, active'),
    ])
    if (ae) throw ae
    if (te) throw te

    const treeCountByArea = new Map<string, number>()
    for (const tree of (trees ?? []) as Pick<Tree, 'area_id' | 'active'>[]) {
      if (!tree.active) continue
      treeCountByArea.set(tree.area_id, (treeCountByArea.get(tree.area_id) ?? 0) + 1)
    }

    return ((areas ?? []) as Area[]).map((area) => ({
      area,
      treeCount: treeCountByArea.get(area.id) ?? 0,
      pendingCount: 0,
      overdueCount: 0,
    }))
  },
}
