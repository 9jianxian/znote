import { Context } from "hono";
import { html, raw } from "hono/html";
import { APP_DATE } from "@/api/info";
import { checkSystemInitialized } from "@/api/system";
import { getSettingValue } from "@/api/setting";
import { getAppName } from "@/utils/helper";

export const index = async (c: Context) => {
    // 首页路由检查系统初始化状态，未初始化则重定向到初始化页面
    if (c.req.path === "/") {
        const initialized = await checkSystemInitialized();
        if (!initialized) {
            return c.redirect("/user/init", 302);
        }
    }

    // 获取站点配置
    const site_setting = (await getSettingValue("site_setting")) || {};

    // dashboard 路由不注入自定义 header（避免在管理页面执行自定义脚本）
    if (c.req.path.startsWith("/dashboard")) {
        site_setting.custom_header = "";
    }

    const title = site_setting.title || getAppName();

    return c.html(html`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${title}</title>
    <meta name="keywords" content="${site_setting.keywords || ""}" />
    <meta name="description" content="${site_setting.description || ""}" />
    <link rel="icon" href="/static/images/znote.svg" />
    <script type="module" crossorigin src="/static/assets/index.${APP_DATE}.js"></script>
    <link rel="stylesheet" href="/static/assets/index.${APP_DATE}.css" />
    <!--自定义header-->
    ${raw(site_setting.custom_header) || ""}
    <!--自定义header end-->
    <style>
      body { margin: 0; background: #f5f7fb; }
      #app-loading {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        font: bold 16px sans-serif;
      }
      #app:not(:empty) + #app-loading,
      #app:not(:empty) ~ #app-loading {
        opacity: 0;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="app-loading">Loading...</div>
  </body>
</html>`);
};
