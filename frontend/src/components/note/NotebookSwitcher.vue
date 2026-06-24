<script setup lang="ts">
/**
 * 笔记本切换器
 *
 * 设计：左文字（仅展示，不可点击）+ 右切换按钮（点击展开下拉）
 * 下拉菜单：
 *   - 列表展示所有顶层笔记本（当前项带 ✓）
 *   - 底部固定一项 "+ 新建笔记本"（分割线隔开）
 *
 * Props:
 *   - notebooks: 顶层笔记本列表
 *   - modelValue: 当前选中的笔记本 id
 *
 * Emits:
 *   - update:modelValue: 切换笔记本
 *   - create: 请求新建笔记本
 */
import { computed } from "vue";
import { NDropdown } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Notebook } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    notebooks: Notebook[];
    modelValue: number | null;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
    (e: "create"): void;
}>();

/** 当前激活的笔记本名 */
const activeTitle = computed(() => {
    return props.notebooks.find((nb) => nb.id === props.modelValue)?.title ?? "";
});

/** Trigger 显示文本：空态兜底"暂无笔记本" */
const triggerText = computed(() => activeTitle.value || t("note.notebook.empty_short"));

/** 下拉菜单选项 */
const dropdownOptions = computed(() => {
    const items: Array<Record<string, unknown>> = props.notebooks.map((nb) => ({
        key: nb.id,
        label: nb.title,
    }));
    items.push({ type: "divider", key: "d1" });
    items.push({
        key: "__create__",
        label: t("note.notebook.create.button"),
    });
    return items;
});

/** 处理菜单选择 */
const handleSelect = (key: string | number) => {
    if (key === "__create__") {
        emit("create");
    } else {
        emit("update:modelValue", key as number);
    }
};


</script>

<template>
  <!-- 容器：仅用于布局，自身不可点击（无边框无背景，水平间距与下方分类树对齐） -->
  <div
    class="flex w-full items-center gap-2 px-2 py-2 text-sm text-slate-200"
  >
    <!-- 左侧：当前笔记本名（纯展示，不可点击） -->
    <span class="flex-1 truncate text-left">{{ triggerText }}</span>

    <!-- 右侧：切换按钮（只有这个能点开下拉） -->
    <NDropdown
      :options="dropdownOptions"
      trigger="click"
      placement="bottom-start"
      @select="handleSelect"
    >
      <button
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-600/60 hover:text-slate-100"
        :title="t('note.notebook.switcher.placeholder')"
      >
        <ZIcon name="ri:swap-line" :size="16" color="currentColor" />
      </button>
    </NDropdown>
  </div>
</template>
