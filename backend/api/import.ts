import { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { checkNotebookOwnership } from "@/utils/ownership";
import { join } from "node:path";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import AdmZip from "adm-zip";

/** 待写入的笔记条目 */
interface NoteEntry {
    notebookId: number;
    title: string;
    content: string;
    mtime: Date;
}

/** 自动生成的包装子分类名（纯扁平 zip 或混合场景兜底） */
const WRAPPER_NAME = "Imported";
/** 自动生成的包装子分类描述（英文） */
const WRAPPER_DESC = "Auto-created from ZIP import";

/**
 * 自定义 zip 文件名解码器：
 * 优先按 UTF-8 解码（fatal: true 会在遇到非法序列时抛错），
 * 失败则回退 GBK（兼容中文 Windows 上常见的 zip 打包方式）。
 */
const decodeFileName = (buf: Buffer): string => {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
        return new TextDecoder("gbk").decode(buf);
    }
};

/**
 * ZIP 导入接口
 * POST /api/user/import
 * multipart/form-data: notebook_id (string → number), file (File)
 *
 * 流程：
 * 1. 校验 notebook_id 归属
 * 2. 解压 ZIP 到临时目录（GBK/UTF-8 自适应文件名解码）
 * 3. 剥离：唯一顶层目录 + 顶层 0 .md + 该目录直接不含 .md → 下沉
 * 4. 包装：rootDir 直接含 .md → 在目标笔记本下建/复用 Imported 子分类
 * 5. 单事务：递归创建 notebooks → 按 title 去重收集 notes → 批量 INSERT
 * 6. 清理临时文件
 */
export const importZip = async (c: Context) => {
    const uid = Number(c.get("uid"));

    // 解析 multipart/form-data
    const formData = await c.req.formData();
    const notebookId = Number(formData.get("notebook_id"));
    const file = formData.get("file");

    // 校验 notebook_id
    if (!notebookId || isNaN(notebookId)) {
        return c.json({ code: -1000, msg: "import.notebook_required", data: null });
    }

    // 校验 file 存在
    if (!file || !(file instanceof File)) {
        return c.json({ code: -1000, msg: "import.file_required", data: null });
    }

    // 校验父笔记本归属当前用户
    const owned = await checkNotebookOwnership(notebookId, uid);
    if (!owned) {
        return c.json({ code: -1000, msg: "import.notebook_not_found", data: null });
    }

    // 创建临时工作目录
    const tmpDir = join("/tmp", `zest_import_${uid}_${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
        // 保存 ZIP 到临时目录并解压（使用自定义 decoder 兼容 GBK 文件名）
        const zipPath = join(tmpDir, "import.zip");
        await Bun.write(zipPath, file);

        const zip = new AdmZip(zipPath, {
            decoder: {
                efs: true,                       // 写出时按 UTF-8（本接口只读，不影响解压）
                decode: decodeFileName,          // 读时：UTF-8 失败回退 GBK
                encode: (data: string) => Buffer.from(data, "utf8"),
            },
        });
        const extractDir = join(tmpDir, "extracted");
        zip.extractAllTo(extractDir, true);

        // 工具：判断目录直接子项中是否有 .md
        const hasMdDirectly = (dir: string): boolean =>
            readdirSync(dir).some((name) => {
                try {
                    return name.endsWith(".md") && statSync(join(dir, name)).isFile();
                } catch {
                    return false;
                }
            });

        // 剥离逻辑：仅当"唯一顶层目录"且"该目录直接不含 .md"时，才下沉
        const entries = readdirSync(extractDir);
        const topDirs = entries.filter((e) => {
            try { return statSync(join(extractDir, e)).isDirectory(); } catch { return false; }
        });
        const topMds = entries.filter((e) => {
            try { return e.endsWith(".md") && statSync(join(extractDir, e)).isFile(); } catch { return false; }
        });

        let rootDir = extractDir;
        if (topDirs.length === 1 && topMds.length === 0) {
            if (!hasMdDirectly(join(extractDir, topDirs[0]))) {
                rootDir = join(extractDir, topDirs[0]);
            }
        }

        // 单事务：所有写入原子提交
        await db.transaction(async (tx) => {
            const pending: NoteEntry[] = [];

            // 工具：复用或创建 Imported 包装子分类
            const getOrCreateWrapper = async (parentDbId: number, fallbackMtime: Date): Promise<number> => {
                const existing = await tx
                    .select({ id: schema.notebooks.id })
                    .from(schema.notebooks)
                    .where(and(
                        eq(schema.notebooks.user_id, uid),
                        eq(schema.notebooks.parent_id, parentDbId),
                        eq(schema.notebooks.title, WRAPPER_NAME),
                    ))
                    .get();
                if (existing) return existing.id;
                const [nb] = await tx
                    .insert(schema.notebooks)
                    .values({
                        user_id: uid,
                        parent_id: parentDbId,
                        title: WRAPPER_NAME,
                        description: WRAPPER_DESC,
                        sort_order: 0,
                        created_at: fallbackMtime,
                        updated_at: fallbackMtime,
                    })
                    .returning();
                return nb.id;
            };

            // 决定 effectiveParent：若 rootDir 直接含 .md，则套 Imported 包装
            let effectiveParent = notebookId;
            if (hasMdDirectly(rootDir)) {
                effectiveParent = await getOrCreateWrapper(notebookId, new Date());
            }

            async function importDir(dir: string, parentDbId: number) {
                const items = readdirSync(dir);

                // 第一遍：递归创建子目录（notebooks）
                // 复用策略：同 parent 下同名子分类直接复用其 id，避免重复创建
                for (const name of items) {
                    const fullPath = join(dir, name);
                    let st;
                    try { st = statSync(fullPath); } catch { continue; }
                    if (st.isDirectory()) {
                        const existing = await tx
                            .select({ id: schema.notebooks.id })
                            .from(schema.notebooks)
                            .where(and(
                                eq(schema.notebooks.user_id, uid),
                                eq(schema.notebooks.parent_id, parentDbId),
                                eq(schema.notebooks.title, name),
                            ))
                            .get();
                        const childId = existing
                            ? existing.id
                            : (await tx
                                .insert(schema.notebooks)
                                .values({
                                    user_id: uid,
                                    parent_id: parentDbId,
                                    title: name,
                                    description: "",
                                    sort_order: 0,
                                    created_at: st.mtime,
                                    updated_at: st.mtime,
                                })
                                .returning())[0].id;
                        await importDir(fullPath, childId);
                    }
                }

                // 第二遍：处理当前目录下的 .md（按 title 去重）
                for (const name of items) {
                    const fullPath = join(dir, name);
                    let st;
                    try { st = statSync(fullPath); } catch { continue; }
                    if (st.isFile() && name.endsWith(".md")) {
                        const title = name.replace(/\.md$/, "");

                        // 去重：同一父笔记本下同 title 且未删除则跳过
                        const dup = await tx
                            .select({ id: schema.notes.id })
                            .from(schema.notes)
                            .where(and(
                                eq(schema.notes.user_id, uid),
                                eq(schema.notes.notebook_id, parentDbId),
                                eq(schema.notes.title, title),
                                eq(schema.notes.is_deleted, 0),
                            ))
                            .get();
                        if (dup) continue;

                        const content = readFileSync(fullPath, "utf-8");
                        pending.push({
                            notebookId: parentDbId,
                            title,
                            content,
                            mtime: st.mtime,
                        });
                    }
                }
            }

            await importDir(rootDir, effectiveParent);

            // 全部收完后，在同一事务内批量 INSERT notes
            if (pending.length > 0) {
                await tx.insert(schema.notes).values(
                    pending.map((e) => ({
                        user_id: uid,
                        notebook_id: e.notebookId,
                        title: e.title,
                        content: e.content,
                        is_pinned: 0,
                        is_deleted: 0,
                        sort_order: 0,
                        created_at: e.mtime,
                        updated_at: e.mtime,
                    }))
                );
            }
        });

        return c.json({ code: 200, msg: "import.success", data: null });
    } finally {
        // 无论成功失败，清理临时目录
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略清理错误 */ }
    }
};
