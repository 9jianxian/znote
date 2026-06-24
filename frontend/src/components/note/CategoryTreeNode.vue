<script setup lang="ts">
/**
 * 分类树节点（递归组件）
 *
 * 支持无限层级，通过 name 引用自身实现递归渲染。
 * 每个节点支持：
 *  - 点击：选中分类
 *  - hover 显示"+"：新建子分类
 *  - 展开/折叠：子节点显示隐藏
 *  - TODO: 拖拽排序（v2）
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { NotebookNode } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    node: NotebookNode;
    /** 当前激活的分类 id */
    activeId: number | null;
    /** 节点在树中的深度（用于样式缩进） */
    level: number;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "requestDialog", parentId: number, parentName: string): void;
    (e: "contextmenu", node: NotebookNode, event: MouseEvent): void;
}>();

/** 展开/折叠状态 */
const expanded = ref(true);
/** 鼠标是否悬停（用于显示"+"按钮） */
const hovered = ref(false);

/** 是否有子节点 */
const hasChildren = () => props.node.children.length > 0;

/** 切换展开 */
const toggleExpand = (e: Event) => {
    e.stopPropagation();
    if (hasChildren()) {
        expanded.value = !expanded.value;
    }
};

/** 选中节点 */
const handleSelect = () => {
    emit("select", props.node.id);
};

/**
 * 触发新建子分类
 * 不再用 window.prompt，改为向上冒泡 requestDialog 事件，
 * 由 NoteView 统一弹出 CreateNotebookDialog
 */
const handleAddChild = (e: Event) => {
    e.stopPropagation();
    expanded.value = true;
    emit("requestDialog", props.node.id, props.node.title);
};
</script>

<template>
  <div class="select-none">
    <!-- 当前节点行 -->
    <div
      class="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition"
      :class="activeId === node.id ? 'bg-blue-500/15 text-blue-300' : 'text-slate-300 hover:bg-slate-700/60'"
      :style="{ paddingLeft: `${8 + level * 16}px` }"
      @click="handleSelect"
      @contextmenu.prevent="(e: MouseEvent) => emit('contextmenu', node, e)"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <!-- 展开/折叠图标（叶子节点占位保持对齐） -->
      <button
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded transition hover:bg-slate-600/60"
        :class="{ 'opacity-0': !hasChildren() }"
        @click="toggleExpand"
      >
        <ZIcon
          :name="expanded ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'"
          :size="14"
          color="currentColor"
        />
      </button>

      <!-- 文件夹图标 -->
      <ZIcon
        :name="activeId === node.id ? 'ri:folder-open-line' : 'ri:folder-line'"
        :size="15"
        color="currentColor"
        class="shrink-0"
      />

      <!-- 节点标题 -->
      <span class="flex-1 truncate">{{ node.title }}</span>

      <!-- 悬停时显示的"新建子分类"按钮 -->
      <button
        v-show="hovered"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-blue-500/20 hover:text-blue-300"
        :title="t('note.category.add_child')"
        @click="handleAddChild"
      >
        <ZIcon name="ri:add-line" :size="14" color="currentColor" />
      </button>
    </div>

    <!-- 递归渲染子节点（无嵌套滚动条，滚动由外层容器统一处理） -->
    <div v-if="hasChildren() && expanded">
      <CategoryTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :active-id="activeId"
        :level="level + 1"
        @select="(id: number) => emit('select', id)"
        @request-dialog="(pid: number, pname: string) => emit('requestDialog', pid, pname)"
        @contextmenu="(n: NotebookNode, e: MouseEvent) => emit('contextmenu', n, e)"
      />
    </div>
  </div>
</template>

<script lang="ts">
/**
 * 组件名显式声明，Vue 递归组件需要
 */
export default {
    name: "CategoryTreeNode",
};
</script>
