import { defineStore } from 'pinia'
import { treeService, treeTypeService, taskCategoryService } from '../services/treeService'
import type { TaskCategory, Tree, TreeType } from '../types/database'

export const useTreeStore = defineStore('tree', {
  state: () => ({
    trees: [] as Tree[],
    currentAreaId: null as string | null,
    loading: false,
  }),

  getters: {
    byId: (s) => (id: string) => s.trees.find((t) => t.id === id),
  },

  actions: {
    async loadTrees(areaId: string, includeInactive = false) {
      this.loading = true
      this.currentAreaId = areaId
      try {
        this.trees = await treeService.listByArea(areaId, includeInactive)
      } finally {
        this.loading = false
      }
    },

    async createTree(input: Partial<Tree>) {
      const t = await treeService.create(input)
      if (this.currentAreaId === t.area_id && !this.trees.some((x) => x.id === t.id)) {
        this.trees.push(t)
      }
      return t
    },

    async createTrees(inputs: Partial<Tree>[]) {
      const trees = await treeService.createMany(inputs)
      if (this.currentAreaId) {
        this.trees.push(...trees.filter((t) => t.area_id === this.currentAreaId && !this.trees.some((x) => x.id === t.id)))
      }
      return trees
    },

    async updateTree(id: string, input: Partial<Tree>) {
      await treeService.update(id, input)
      const local = this.trees.find((t) => t.id === id)
      if (local) Object.assign(local, input)
    },

    async updateTreePosition(id: string, x: number, y: number) {
      await treeService.updatePosition(id, x, y)
      const local = this.trees.find((t) => t.id === id)
      if (local) {
        local.position_x = Math.round(x)
        local.position_y = Math.round(y)
      }
    },

    async softDeleteTree(id: string) {
      await treeService.softDelete(id)
      this.trees = this.trees.filter((t) => t.id !== id)
    },

    async hardDeleteTree(id: string) {
      await treeService.hardDelete(id)
      this.trees = this.trees.filter((t) => t.id !== id)
    },
  },
})

export const useMasterStore = defineStore('master', {
  state: () => ({
    treeTypes: [] as TreeType[],
    taskCategories: [] as TaskCategory[],
    loaded: false,
    loadedInactive: false,
  }),

  getters: {
    treeTypeName: (s) => (id: string | null) =>
      id ? s.treeTypes.find((t) => t.id === id)?.name ?? null : null,
    categoryOptions: (s) =>
      s.taskCategories.map((c) => ({ label: c.name, value: c.id })),
    treeTypeOptions: (s) => s.treeTypes.map((t) => ({ label: t.name, value: t.id })),
  },

  actions: {
    async loadAll(force = false, includeInactive = false) {
      if (this.loaded && !force && includeInactive === this.loadedInactive) return
      const [tt, tc] = await Promise.all([
        treeTypeService.list(includeInactive),
        taskCategoryService.list(includeInactive),
      ])
      this.treeTypes = tt
      this.taskCategories = tc
      this.loaded = true
      this.loadedInactive = includeInactive
    },

    async createTreeType(input: Partial<TreeType>) {
      await treeTypeService.create(input)
      await this.loadAll(true)
    },
    async updateTreeType(id: string, input: Partial<TreeType>) {
      await treeTypeService.update(id, input)
      const local = this.treeTypes.find((t) => t.id === id)
      if (local) Object.assign(local, input)
    },
    async hardDeleteTreeType(id: string) {
      await treeTypeService.hardDelete(id)
      this.treeTypes = this.treeTypes.filter((t) => t.id !== id)
    },
    async createCategory(input: Partial<TaskCategory>) {
      await taskCategoryService.create(input)
      await this.loadAll(true)
    },
    async updateCategory(id: string, input: Partial<TaskCategory>) {
      await taskCategoryService.update(id, input)
      const local = this.taskCategories.find((c) => c.id === id)
      if (local) Object.assign(local, input)
    },
    async hardDeleteCategory(id: string) {
      await taskCategoryService.hardDelete(id)
      this.taskCategories = this.taskCategories.filter((c) => c.id !== id)
    },
  },
})
