# 校园充电位状态页

这是一个校园快捷直达页面，包含外卖柜、快递驿站、11 台充电桩状态和校园餐饮入口。线上充电凭证经 AES-256-GCM 加密后保存在 Supabase，由 Netlify Function 使用，不会返回给浏览器。

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

也可以长按“重新查询”打开隐藏的手动凭证输入区，直接粘贴 `userAuthorization.do` 的完整 JSON 响应。本地服务会把解析后的 `authorization` 和 `openId` 保存在 Node.js 进程内存中；线上 Netlify 会加密写入 Supabase。完整响应不写入浏览器持久存储。

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

当前测试站为 `https://campustest222.netlify.app/`。部署完成后先访问 `/api/health`，应得到 `{"ok":true}`。如果只有页面能打开而健康检查返回 404，说明 Functions 或重定向规则没有随项目部署。

## 自动更新凭证（Supabase + Windows 微信）

自动更新采用按需模式：Netlify 查询发现凭证失效时写入刷新任务；Windows
计划任务约每 15 秒进行一次隐藏的单次检查，领取任务后先重启 Reqable、强制开启
Reqable 系统代理，再打开车充安并从 Reqable 捕获目录读取授权响应。网页保留原有
11 张设备卡片并自动重试。另有每周三、周日 00:00 的主动刷新任务。

1. 在 Supabase SQL Editor 执行 `supabase.sql`。
2. 在 Netlify 配置 `.env.example` 中的四个服务端环境变量。
3. 保证 Reqable 的证书、自动抓包和 `9000` 端口配置可用。代理会直接读取 Reqable 捕获目录；脚本可作为备用。
4. 复制 `agent/agent.env.example` 为 `agent/agent.env`，填写相同的代理密钥、Reqable 路径和捕获文件绝对路径。
5. 用 `agent/run-hidden.vbs --once` 建立隐藏的 Windows 计划任务。当前电脑采用每分钟四个错开的触发器（`00/15/30/45` 秒），无任务时立即退出，不常驻命令行。

代理默认先打开 `LEGACY_OPEN_URL` 建立微信授权上下文，再从服务端获取 `weixin://`
链接打开车充安。每轮最多等待 20 秒，默认最多两轮。代理永远不会结束微信主程序或
`WeChatAppEx`：如果 Reqable 在任务前已运行，任务后保持运行；如果任务前未运行，
任务后关闭 Reqable 并恢复原 Windows/Clash 代理状态。可用
`CHARGING_OPEN_COMMAND` 和 `CHARGING_CLOSE_COMMAND` 覆盖默认动作，但不要通过结束微信进程实现关闭车充安。

所有凭证在写入 Supabase 前均使用 AES-256-GCM 加密；Supabase 表不向 `anon` 或
`authenticated` 角色开放。Supabase Secret Key、加密密钥和代理密钥不得写入仓库。

完整架构、计划任务、页面状态和排障说明见 [HANDOFF.md](HANDOFF.md)。
