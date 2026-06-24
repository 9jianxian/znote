<script setup lang="ts">
/**
 * 分类树容器
 *
 * 职责：
 * 1. 展示当前选中笔记本下的所有子分类（递归树）
 * 2. 转发节点的选中、新建子分类事件给父组件
 * 3. 空态友好提示
 *
 * Props:
 *   - tree: 当前笔记本的子分类树（顶层是笔记本的 children）
 *   - activeId: 当前选中的分类 id
 *
 * Emits:
 *   - select: 选中分类
 *   - addChild: 新建子分类
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import CategoryTreeNode from "@/components/note/CategoryTreeNode.vue";
import type { NotebookNode } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    /** 当前笔记本的 children（已经过滤过） */
    tree: NotebookNode[];
    activeId: number | null;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "addChild", id: number, title: string): void;
    (e: "requestDialog", parentId: number, parentName: string): void;
    (e: "contextmenu", node: NotebookNode, event: MouseEvent): void;
}>();

/** 是否为空 */
const isEmpty = computed(() => props.tree.length === 0);
</script>

<template>
  <div class="space-y-0.5">
    <!-- 有分类时递归渲染 -->
    <template v-if="!isEmpty">
      <CategoryTreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :active-id="activeId"
        :level="0"
        @select="(id: number) => emit('select', id)"
        @add-child="(id: number, title: string) => emit('addChild', id, title)"
        @request-dialog="(pid: number, pname: string) => emit('requestDialog', pid, pname)"
        @contextmenu="(node: NotebookNode, e: MouseEvent) => emit('contextmenu', node, e)"
      />
    </template>

    <!-- 空态提示 -->
    <div v-else class="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/60">
        <ZIcon name="ri:folder-open-line" :size="20" color="#94a3b8" />
      </div>
      <p class="text-xs text-slate-400">{{ t("note.category.empty") }}</p>
    </div>
  </div>
</template>
