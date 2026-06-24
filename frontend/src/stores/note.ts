/**
 * 笔记工作台 Pinia Store
 *
 * 设计要点：
 * 1. 后端只提供平铺数据（notebook/list），前端在内存中组装成树形结构
 * 2. 笔记按 notebook_id 维度缓存（notesByCategory），避免重复请求
 * 3. 聚合笔记（aggregatedNotes）缓存"某节点下所有笔记 id 集合"，切换分类时秒出
 * 4. 当前选中的笔记本/分类/笔记用 ref 跟踪，所有组件通过 store 联动
 */
import { defineStore } from "pinia";
import * as notebookApi from "@/api/notebook";
import * as noteApi from "@/api/note";
import type { CreateNotebookPayload, CreateNotePayload, Note, Notebook, NotebookNode } from "@/types/note";

interface LoadingState {
    tree: boolean;     // 笔记本树加载中
    notes: boolean;    // 笔记列表加载中
    save: boolean;     // 创建/更新操作中
}

/**
 * 把扁平数据组装成树形结构
 * 独立函数，方便在 getter 和 action 中复用
 */
const buildNodeTree = (allNotebooks: Notebook[], notebook: Notebook): NotebookNode => {
    const children = allNotebooks
        .filter((nb) => nb.parent_id === notebook.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((child) => buildNodeTree(allNotebooks, child));
    return { ...notebook, children };
};

export const useNoteStore = defineStore("note", {
    state: () => ({
        /** 后端拉回来的扁平数据，全量缓存 */
        allNotebooks: [] as Notebook[],
        /** 顶层笔记本（parent_id === null），方便下拉框直接使用 */
        topNotebooks: [] as Notebook[],
        /** 已加载过笔记的分类 id 集合（用于避免重复请求） */
        loadedCategoryIds: new Set<number>(),
        /** 分类 id → 该分类下的笔记列表 */
        notesByCategory: {} as Record<number, Note[]>,
        /** 当前选中的笔记本（顶层）id */
        activeNotebookId: null as number | null,
        /** 当前选中的分类 id（null 表示未选中） */
        activeCategoryId: null as number | null,
        /** 当前选中的笔记 id */
        activeNoteId: null as number | null,
        /** 加载状态 */
        loading: {
            tree: false,
            notes: false,
            save: false,
        } as LoadingState,
    }),

    getters: {
        /**
         * 完整的分类树（仅顶层节点，子节点嵌在 children 里）
         * 适用于第一栏分类树渲染
         */
        categoryTree(state): NotebookNode[] {
            return state.topNotebooks.map((top) => buildNodeTree(state.allNotebooks, top));
        },

        /**
         * 当前选中的笔记本节点
         */
        activeNotebook(state): Notebook | null {
            if (state.activeNotebookId === null) return null;
            return state.allNotebooks.find((n) => n.id === state.activeNotebookId) ?? null;
        },

        /**
         * 当前选中的分类节点
         */
        activeCategory(state): Notebook | null {
            if (state.activeCategoryId === null) return null;
            return state.allNotebooks.find((n) => n.id === state.activeCategoryId) ?? null;
        },

        /**
         * 当前选中的笔记
         */
        activeNote(state): Note | null {
            if (state.activeNoteId === null) return null;
            for (const list of Object.values(state.notesByCategory)) {
                const found = list.find((n) => n.id === state.activeNoteId);
                if (found) return found;
            }
            return null;
        },

        /**
         * 第二栏展示用：当前选中分类下的"聚合"笔记列表
         * 包含该节点及所有后代分类的笔记，去重后按"置顶+更新时间"排序
         */
        displayedNotes(state): Note[] {
            if (state.activeCategoryId === null) return [];

            // 收集当前分类及所有后代的 id
            const targetIds = new Set<number>([state.activeCategoryId]);
            const collect = (id: number) => {
                state.allNotebooks.forEach((nb) => {
                    if (nb.parent_id === id) {
                        targetIds.add(nb.id);
                        collect(nb.id);
                    }
                });
            };
            collect(state.activeCategoryId);

            // 合并所有目标分类下的笔记
            const merged = new Map<number, Note>();
            targetIds.forEach((cid) => {
                const list = state.notesByCategory[cid] ?? [];
                list.forEach((n) => {
                    // 排除软删除
                    if (n.is_deleted === 0) merged.set(n.id, n);
                });
            });

            // 排序：置顶在前，再按更新时间倒序
            return Array.from(merged.values()).sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
        },
    },

    actions: {
        /**
         * 加载笔记本树（首次进入工作台时调用）
         * 一次性拉全量数据，前端组装
         */
        async loadNotebookTree() {
            this.loading.tree = true;
            try {
                const list = await notebookApi.fetchNotebookList();
                this.allNotebooks = list;
                this.topNotebooks = list
                    .filter((nb) => nb.parent_id === null)
                    .sort((a, b) => a.sort_order - b.sort_order);

                // 默认选中第一个顶层笔记本
                if (this.activeNotebookId === null && this.topNotebooks.length > 0) {
                    this.activeNotebookId = this.topNotebooks[0].id;
                }
            } finally {
                this.loading.tree = false;
            }
        },

        /**
         * 切换顶层笔记本
         * 切换后重置分类选中状态
         */
        switchNotebook(id: number) {
            this.activeNotebookId = id;
            this.activeCategoryId = null;
            this.activeNoteId = null;
        },

        /**
         * 选中分类，按需加载该分类下的笔记
         */
        async selectCategory(id: number | null) {
            this.activeCategoryId = id;
            this.activeNoteId = null;
            if (id !== null && !this.loadedCategoryIds.has(id)) {
                await this.loadCategoryNotes(id);
            }
        },

        /**
         * 加载指定分类的笔记（带缓存）
         */
        async loadCategoryNotes(categoryId: number) {
            this.loading.notes = true;
            try {
                const notes = await noteApi.fetchNoteList(categoryId);
                this.notesByCategory = { ...this.notesByCategory, [categoryId]: notes };
                this.loadedCategoryIds.add(categoryId);
            } finally {
                this.loading.notes = false;
            }
        },

        /**
         * 选中笔记
         */
        selectNote(id: number | null) {
            this.activeNoteId = id;
        },

        /**
         * 创建笔记本（顶层）或子分类
         */
        async createNotebook(payload: CreateNotebookPayload) {
            this.loading.save = true;
            try {
                const result = await notebookApi.createNotebook(payload);
                if (result) {
                    // 局部更新：插入新节点到 allNotebooks
                    this.allNotebooks = [...this.allNotebooks, result];
                    // 若是顶层笔记本，追加到 topNotebooks
                    if (result.parent_id === null) {
                        this.topNotebooks = [...this.topNotebooks, result].sort(
                            (a, b) => a.sort_order - b.sort_order,
                        );
                    }
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 创建笔记
         */
        async createNote(payload: CreateNotePayload) {
            this.loading.save = true;
            try {
                const result = await noteApi.createNote(payload);
                if (result) {
                    // 写入对应分类的笔记列表
                    const existing = this.notesByCategory[result.notebook_id] ?? [];
                    this.notesByCategory = {
                        ...this.notesByCategory,
                        [result.notebook_id]: [result, ...existing],
                    };
                    this.loadedCategoryIds.add(result.notebook_id);
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 更新笔记（部分更新）
         * 更新成功后同步更新本地缓存
         */
        async updateNote(
            id: number,
            payload: Partial<Pick<import("@/types/note").Note, "title" | "content" | "notebook_id" | "is_pinned" | "sort_order">>,
        ) {
            this.loading.save = true;
            try {
                const result = await noteApi.updateNote(id, payload);
                if (result) {
                    // 同步更新本地缓存中对应的笔记
                    for (const cid of Object.keys(this.notesByCategory)) {
                        const list = this.notesByCategory[Number(cid)];
                        const idx = list.findIndex((n) => n.id === id);
                        if (idx !== -1) {
                            list[idx] = result;
                            this.notesByCategory = { ...this.notesByCategory };
                            break;
                        }
                    }
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },
    },
});
