<script setup lang="ts">
/**
 * 笔记元信息条
 *
 * 展示创建时间、修改时间、所在分类。
 * 在标题下方、编辑器上方展示。
 * 最右侧显示保存按钮。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Note } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    note: Note;
    /** 所在分类名称（用于展示） */
    categoryName: string;
    /** 保存按钮 loading 态 */
    saving?: boolean;
}>();

const emit = defineEmits<{
    (e: "save"): void;
}>();

/** 格式化时间：年/月/日 时:分:秒 */
const formatTime = (val: number | string) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** 创建时间展示 */
const createdText = computed(() => formatTime(props.note.created_at));
/** 修改时间展示 */
const updatedText = computed(() => formatTime(props.note.updated_at));
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <!-- 左侧：元信息 -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
      <!-- 所在分类 -->
      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:folder-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.notebook") }}：</span>
        <span class="text-slate-700">{{ categoryName }}</span>
      </div>

      <!-- 创建时间 -->
      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:add-circle-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.created_at") }}：</span>
        <span class="text-slate-700">{{ createdText }}</span>
      </div>

      <!-- 修改时间 -->
      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:edit-2-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.updated_at") }}：</span>
        <span class="text-slate-700">{{ updatedText }}</span>
      </div>
    </div>

    <!-- 右侧：保存按钮 -->
    <button
      class="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="saving"
      @click="emit('save')"
    >
      <ZIcon v-if="!saving" name="ri:save-line" :size="14" color="currentColor" />
      <ZIcon v-else name="ri:loader-4-line" :size="14" color="currentColor" class="animate-spin" />
      <span>{{ saving ? t("note.editor.saving") : t("note.editor.save") }}</span>
    </button>
  </div>
</template>
