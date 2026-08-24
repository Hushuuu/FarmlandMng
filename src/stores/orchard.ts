import { defineStore } from 'pinia'
import { areaService, orchardService } from '../services/orchardService'
import type { Area, Orchard } from '../types/database'

export const useOrchardStore = defineStore('orchard', {
  state: () => ({
    orchards: [] as Orchard[],
    current: null as Orchard | null,
    areas: [] as Area[],
    loading: false,
  }),

  actions: {
    async loadOrchards(includeInactive = false) {
      this.loading = true
      try {
        this.orchards = await orchardService.list(includeInactive)
      } finally {
        this.loading = false
      }
    },

    async loadOrchard(id: string) {
      this.current = await orchardService.get(id)
      return this.current
    },

    async createOrchard(input: Partial<Orchard>) {
      const o = await orchardService.create(input)
      await this.loadOrchards()
      return o
    },

    async updateOrchard(id: string, input: Partial<Orchard>) {
      await orchardService.update(id, input)
      if (this.current?.id === id) Object.assign(this.current, input)
      await this.loadOrchards()
    },

    async softDeleteOrchard(id: string) {
      await orchardService.softDelete(id)
      await this.loadOrchards()
    },

    async hardDeleteOrchard(id: string) {
      await orchardService.hardDelete(id)
      await this.loadOrchards(true)
    },
  },
})

export const useAreaStore = defineStore('area', {
  state: () => ({
    areas: [] as Area[],
    current: null as Area | null,
    loading: false,
  }),

  getters: {
    byId: (s) => (id: string) => s.areas.find((a) => a.id === id),
  },

  actions: {
    async loadAreas(orchardId: string, includeInactive = false) {
      this.loading = true
      try {
        this.areas = await areaService.listByOrchard(orchardId, includeInactive)
      } finally {
        this.loading = false
      }
    },

    async loadArea(id: string) {
      this.current = await areaService.get(id)
      return this.current
    },

    async createArea(input: Partial<Area>) {
      const a = await areaService.create(input)
      if (!this.areas.some((x) => x.id === a.id)) this.areas.push(a)
      return a
    },

    async updateArea(id: string, input: Partial<Area>) {
      await areaService.update(id, input)
      const local = this.areas.find((a) => a.id === id)
      if (local) Object.assign(local, input)
    },

    async updateAreaPosition(id: string, x: number, y: number) {
      await areaService.updatePosition(id, x, y)
      const local = this.areas.find((a) => a.id === id)
      if (local) {
        local.position_x = Math.round(x)
        local.position_y = Math.round(y)
      }
    },

    async softDeleteArea(id: string) {
      await areaService.softDelete(id)
      this.areas = this.areas.filter((a) => a.id !== id)
    },

    async hardDeleteArea(id: string) {
      await areaService.hardDelete(id)
      this.areas = this.areas.filter((a) => a.id !== id)
    },
  },
})
