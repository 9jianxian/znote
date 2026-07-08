import { Hono } from "hono";
import { adminRouter, publicRouter, userRouter } from "./routers";
import { ensureFtsSchema } from "./db/fts";
import { startCronJobs } from "./utils/jobs";
import { index } from "./api/html";

// 启动时初始化 FTS5 全文搜索索引（建表 + 触发器 + 历史数据回填，幂等）
await ensureFtsSchema();

// 启动定时任务
startCronJobs();

const app = new Hono();

app.route("/", publicRouter);
app.route("/", userRouter);
app.route("/", adminRouter);

// 兜底路由：所有未匹配的 GET 请求返回 SPA HTML，由前端 Vue Router 接管（含 404 页面）
app.notFound(index);

export default {
    port: Number(Bun.env.ZNOTE_PORT || 3888),
    fetch: app.fetch,
    idleTimeout: 120,
};
