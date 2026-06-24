<script setup lang="ts">
/**
 * Milkdown 编辑器核心组件
 *
 * 基于 @milkdown/crepe 的 WYSIWYG Markdown 编辑器
 * 实现 v-model 兼容，支持外部值同步和输入监听
 */
import { Crepe } from "@milkdown/crepe";
import { Milkdown, useEditor, useInstance } from "@milkdown/vue";
import { replaceAll, getMarkdown } from "@milkdown/utils";
import { listener } from "@milkdown/plugin-listener";
import { watch, onMounted } from "vue";

const props = defineProps<{
    /** 编辑器内容（Markdown 格式） */
    modelValue: string;
    /** 占位提示文本 */
    placeholder?: string;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "ready"): void;
}>();

/** 标记是否由内部触发的内容更新，避免循环同步 */
let isInternalUpdate = false;

// 初始化编辑器
const { get } = useEditor((root) => {
    const crepe = new Crepe({
        root,
        defaultValue: props.modelValue,
        features: {
            // 启用常用功能
            [Crepe.Feature.Toolbar]: true,
            [Crepe.Feature.Placeholder]: true,
            [Crepe.Feature.ListItem]: true,
            [Crepe.Feature.LinkTooltip]: true,
            [Crepe.Feature.ImageBlock]: true,
            [Crepe.Feature.Table]: true,
            // 禁用不需要的功能
            [Crepe.Feature.CodeMirror]: false,
            [Crepe.Feature.Latex]: false,
            [Crepe.Feature.AI]: false,
            [Crepe.Feature.TopBar]: false,
        },
        featureConfigs: {
            [Crepe.Feature.Placeholder]: {
                text: props.placeholder || "开始编写...",
                mode: "doc",
            },
        },
    });

    // 使用 listener 插件监听内容变化
    crepe.on((manager) => {
        manager.markdownUpdated((ctx, markdown, prevMarkdown) => {
            if (!isInternalUpdate && markdown !== prevMarkdown) {
                emit("update:modelValue", markdown);
            }
        });
        manager.mounted(() => {
            emit("ready");
        });
    });

    return crepe;
});

// 获取编辑器实例
const [isLoading, getInstance] = useInstance();

/**
 * 监听外部值变化（切换笔记时同步到编辑器）
 * 使用 isInternalUpdate 标记避免循环更新
 */
watch(
    () => props.modelValue,
    (val) => {
        if (isLoading.value || isInternalUpdate) return;
        const editor = getInstance();
        if (editor) {
            const currentMarkdown = editor.action(getMarkdown());
            if (val !== currentMarkdown) {
                isInternalUpdate = true;
                editor.action(replaceAll(val || ""));
                // 短暂延迟后重置标记
                setTimeout(() => {
                    isInternalUpdate = false;
                }, 0);
            }
        }
    },
);
</script>

<template>
  <Milkdown />
</template>
