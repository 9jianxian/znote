<script setup lang="ts">
/**
 * 笔记历史版本抽屉
 *
 * 打开时按 noteId 拉取该笔记的历史版本列表，展示版本号、旧标题、修改时间。
 * 三态：加载中（NSkeleton 骨架占位）/ 空态（文字提示）/ 有数据（列表）。
 * 每行预留【查看】【恢复】两个按钮，本轮仅占位，无任何点击逻辑。
 *
 * 容器限高 + 内部滚动，避免版本过多导致窗口无限增长。
 */
import { ref, watch } from "vue";
import { NDrawer, NDrawerContent, NSkeleton, NEmpty } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import { fetchNoteVersions } from "@/api/note";
import type { NoteVersionItem } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    show: boolean;
    noteId: number | null;
}>();

const emit = defineEmits<{
    (e: "update:show", val: boolean): void;
}>();

/** 加载态：loading | empty | done */
const status = ref<"loading" | "empty" | "done">("loading");
/** 版本列表 */
const versions = ref<NoteVersionItem[]>([]);

/** 格式化时间：年/月/日 时:分:秒 */
const formatTime = (val: number | string) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * 加载版本列表
 * 打开抽屉时触发；noteId 无效时直接走空态
 */
const loadVersions = async () => {
    if (props.noteId === null) {
        status.value = "empty";
        versions.value = [];
        return;
    }
    status.value = "loading";
    const res = await fetchNoteVersions(props.noteId);
    if (res === null) {
        status.value = "empty";
        versions.value = [];
        return;
    }
    versions.value = res;
    status.value = res.length === 0 ? "empty" : "done";
};

// 抽屉打开时拉取数据
watch(
    () => props.show,
    (val) => {
        if (val) {
            void loadVersions();
        }
    },
);
</script>

<template>
  <NDrawer
    :show="props.show"
    :width="420"
    placement="right"
    @update:show="(val: boolean) => emit('update:show', val)"
  >
    <NDrawerContent
      :title="t('note.version.title')"
      closable
    >
      <!-- 内容区：限高 + 滚动，避免版本过多无限增长 -->
      <div class="version-list">
        <!-- 加载中：骨架片占位 -->
        <template v-if="status === 'loading'">
          <div
            v-for="i in 5"
            :key="i"
            class="version-item"
          >
            <NSkeleton text :repeat="2" />
          </div>
        </template>

        <!-- 空态 -->
        <NEmpty
          v-else-if="status === 'empty'"
          :description="t('note.version.empty')"
          class="py-12"
        />

        <!-- 有数据：版本列表 -->
        <template v-else>
          <div
            v-for="item in versions"
            :key="item.id"
            class="version-item"
          >
            <!-- 顶部：版本号 + 修改时间 -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <ZIcon name="ri:history-line" :size="14" color="#94a3b8" />
                <span class="text-sm font-medium text-slate-700">v{{ item.version_no }}</span>
              </div>
              <span class="text-xs text-slate-400">{{ formatTime(item.created_at) }}</span>
            </div>

            <!-- 底部：预留操作按钮（仅占位，无任何点击逻辑） -->
            <div class="mt-2 flex justify-end gap-2">
              <button
                class="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
                type="button"
              >
                {{ t("note.version.view") }}
              </button>
              <button
                class="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
                type="button"
              >
                {{ t("note.version.restore") }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
/* 内容区限高 + 内部滚动，防止版本过多窗口过高 */
.version-list {
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* 单条版本卡片 */
.version-item {
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
}
</style>
