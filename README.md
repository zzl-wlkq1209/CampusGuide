# 校园充电位状态页

这是一个校园快捷直达页面，包含外卖柜、快递驿站、11 台充电桩状态和校园餐饮入口。微信凭证只保留在 Node.js 后端，不会发送给浏览器。

快递板块支持粘贴近邻宝短信，自动识别带连字符或不带连字符的 8 位取件码及 1–6 号柜，并可复制取件码后打开对应柜机页面。

## Windows 本地运行

需要 Node.js 18 或更高版本。在 PowerShell 中进入本目录后执行：

```powershell
node server.js `
  --har ".\captures\mini.99cda.com_2026_10_09_01_31_25.har" `
  --legacy-har ".\captures\wx.99cda.com_2026_10_09_01_01_44.har"
```

浏览器打开 `http://127.0.0.1:4173`。

`--har` 用于 13 号楼、7 号楼和新 1 学生公寓的新版接口；`--legacy-har` 提供国防科技园旧版页面所需的微信会话。凭证失效时，用 Reqable 重新导出并覆盖对应路径即可；服务会在下一次点击查询时自动读取，无需重启。

也可以在网页右上角点击“更新凭证”，直接粘贴 `userAuthorization.do` 的完整 JSON 响应。网页只提取 `authorization` 和 `openId`，并将它们保存在当前 Node.js 进程内存中；服务重启后会重新使用启动参数指定的 HAR。

浏览器还会把这份短期响应保存在当前标签页的 `sessionStorage`，并随每次状态查询和充电页跳转提交给同源后端。这是为了兼容 Netlify Functions 的无状态运行方式；关闭标签页后该副本会自动清除。

## 服务器运行

本仓库已包含用于个人部署的 HAR。也可以使用环境变量配置：

- `CHARGING_AUTHORIZATION`
- `CHARGING_OPEN_ID`
- `CHARGING_OPERATOR_ID`（默认 `100664`）
- `CHARGING_GID`（默认 `FFFF000102115980`）
- `CHARGING_LEGACY_HAR_PATH`（国防科技园旧版页面所需）
- `HOST`（服务器建议 `0.0.0.0`）
- `PORT`（默认 `4173`）

令牌失效后接口会显示需要重新抓取。生产部署应配置 HTTPS，并限制页面访问范围。

## Netlify 部署

仓库已包含 `netlify.toml` 和 Functions 适配。必须部署整个仓库，不能只上传 `public` 目录，否则 `/api/status`、`/api/credentials` 和 `/api/open` 不存在，充电查询会失败。把 GitHub 仓库导入 Netlify 后无需填写构建命令，发布目录和函数目录会自动从配置读取。

部署完成后先访问 `/health`，应得到 `{"ok":true}`。如果只有页面能打开而 `/health` 返回 404，说明 Functions 或重定向规则没有随项目部署。

## 自动更新凭证（Supabase + Windows 微信）

自动更新采用按需模式：Netlify 查询发现凭证失效时写入刷新任务，Windows
代理打开车充安，Reqable 脚本捕获授权响应并上传。网页保持原有加载状态并自动重试。
代理还会在每周三、周日 00:00 主动执行一次相同流程。

1. 在 Supabase SQL Editor 执行 `supabase.sql`。
2. 在 Netlify 配置 `.env.example` 中的四个服务端环境变量。
3. 在 Reqable 中导入并启用 `agent/reqable_capture.py`，保持系统代理与自动抓包可用。
4. 复制 `agent/agent.env.example` 为 `agent/agent.env`，填写相同的代理密钥、Reqable 路径和捕获文件绝对路径。
5. 执行 `npm run agent`，并把该命令配置为 Windows 登录后自动启动。

代理默认从服务端获取 `weixin://` 链接打开车充安。完成上传和全设备查询后，它会结束
`WeChatAppEx.exe` 和 `Reqable.exe`；微信主程序及其登录状态不受影响。若本机行为不同，可用
`CHARGING_OPEN_COMMAND` 和 `CHARGING_CLOSE_COMMAND` 覆盖默认动作。

所有凭证在写入 Supabase 前均使用 AES-256-GCM 加密；Supabase 表不向 `anon` 或
`authenticated` 角色开放。Supabase Secret Key、加密密钥和代理密钥不得写入仓库。
