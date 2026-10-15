# 北理校园直达：项目交接文档

> 用途：在新的 Codex 对话中继续维护本项目。新对话应先完整阅读本文，再检查 `git status`、最近提交和线上健康检查。本文不包含任何真实密钥或充电凭证。

## 1. 当前项目与部署

- 本地目录：`E:\codex临时\充电桩页面集成`
- GitHub：`https://github.com/zzl-wlkq1209/CampusGuide.git`
- 默认分支：`main`
- 当前 Netlify：`https://campustest222.netlify.app/`
- 线上健康检查：`https://campustest222.netlify.app/api/health`
- 本地预览：`http://127.0.0.1:4173/`
- Node.js：18 或更高版本
- 最新提交：以 `git log -1 --oneline` 为准。
- 本轮目标线上构建标识：`2026-10-15-27-devices-v1`

Netlify 连接 GitHub `main`。推送会消耗 Netlify 部署额度，因此除非用户明确要求推送，否则前端或 Function 修改先保留在本地并测试；不要为了小改动反复推送。

## 2. 项目结构

```text
充电桩页面集成/
├─ public/
│  ├─ index.html                    # 单页应用：HTML、CSS、浏览器 JS
│  ├─ 8250377f...txt                # 微信域名验证文件
│  ├─ 59ca3047...txt                # 另一份验证文件
│  └─ qrcodes/                      # 外卖、餐饮二维码
├─ agent/
│  ├─ windows-agent.js              # Windows 凭证代理
│  ├─ agent.env.example             # 本机代理配置模板
│  ├─ run-agent.cmd                 # 固定 Node 路径的启动器
│  ├─ run-hidden.vbs                # 隐藏窗口、运行后退出
│  └─ reqable_capture.py            # Reqable 脚本备用方案
├─ captures/                        # 两套历史 HAR；可能含敏感会话
├─ netlify/functions/api.js         # 线上 API 与刷新任务状态机
├─ cloud-store.js                   # Supabase、AES-256-GCM、任务表
├─ server.js                        # 设备清单、查询、凭证解析、跳转
├─ supabase.sql                     # 两张表、RLS 与权限
├─ test/                            # Node 流程测试
├─ netlify.toml
├─ .env.example
├─ README.md
└─ HANDOFF.md
```

项目没有前端框架和构建步骤。`public/index.html` 是完整前端；本地 `server.js` 和线上 Netlify Function 共用 `server.js`、`cloud-store.js` 中的业务逻辑。

## 3. 页面功能与交互

页面包含“外卖、快递、充电、餐饮”四个标签，默认打开外卖。

### 3.1 通用界面

- 页面普通文字不可选中，输入框与文本域仍可选择文字。
- 手机端保持两列紧凑布局。
- 点按卡片有反馈；触摸滚动不会被当作点击。

### 3.2 快递

- 粘贴近邻宝短信后识别 8 位取件码、1—6 号柜和类似 `A18` 的柜门号。
- 支持 `1481-3374` 与 `14813374`。
- 点击“取件”会尝试复制纯数字取件码、清空表单并打开对应柜机页面。
- 微信浏览器不允许网页主动读取剪贴板，因此不要恢复自动读取剪贴板。

### 3.3 充电

- 第一次切换到充电标签才发起查询。
- 页面脚本加载后立即渲染 27 张“等待刷新”卡片，避免首次查询显示一个空白加载框。
- 等待卡片列出设备名、10 个待刷新端口，并可直接点击手动打开对应充电页面。
- 查询过程中保留现有 27 张卡片，不用全屏加载态替换。
- 成功后卡片显示空闲数/总端口数与 10 个端口状态。
- 某台查询失败时，该卡片保持在原位置并以红色故障样式显示。
- 总体错误显示在“充电桩状态”标题下方，与“xx 更新 · 共 27 台”处于同一文本区域并换行；不占用“重新查询”按钮左侧，也不弹故障模态框。
- 查询时按钮文字直接变为“查询中”；原结果一直保留，成功或失败后再更新状态文字。
- 凭证状态只用页面中央白底渐隐浮窗提示 1 秒：`当前凭证有效` 或 `正在重新获取凭证`。
- 长按“重新查询”约 650ms 会显示隐藏的手动凭证输入区；页面没有公开说明这一入口。
- 当前前端最多轮询 60 次，每次间隔 2.5 秒，理论最长约 150 秒。用户曾表示不希望等待太久，但尚未要求再次部署缩短版本；若后续调整，可改回 24 次（约 60 秒）并与云端超时一起评估。

## 4. 充电设备清单

权威清单位于 `server.js` 的 `DEVICES`。前端等待卡片在 `public/index.html` 的 `chargingDevices` 中复制了 `id/name`，增删设备时必须同步两处。

| 名称 | id | q | GID | operatorId | 模式 |
|---|---|---|---|---|---|
| 13号楼1号机 | `building-13-1` | `0400000000022269` | `FFFF000102116079` | `100664` | mini |
| 13号楼2号机 | `building-13-2` | `0400000000022818` | `FFFF000102115980` | `100664` | mini |
| 7号楼1号机 | `building-7-1` | `0400000000023982` | `FFFF000102120435` | `100664` | mini |
| 7号楼2号机 | `building-7-2` | `0400000000027455` | `FFFF000102133318` | `100664` | mini |
| 12号楼1号机 | `building-12-1` | `0400000000021978` | `FFFF000102115982` | `100664` | mini |
| 12号楼2号机 | `building-12-2` | `0400000000022277` | `FFFF000102116731` | `100664` | mini |
| 11号楼1号机 | `building-11-1` | `0400000000022229` | `FFFF000102116794` | `100664` | mini |
| 11号楼2号机 | `building-11-2` | `0400000000022314` | `FFFF000102116140` | `100664` | mini |
| 国防科技园1号机 | `defense-1` | `0400000000022530` | `FFFF000102117180` | `103745` | legacy |
| 国防科技园2号机 | `defense-2` | `0400000000022753` | `FFFF000102111097` | `103745` | legacy |
| 硕博一东南侧 | `graduate-one-southeast` | `0400000000012675` | `FFFF000102132550` | `100664` | mini |
| 光电教学楼北侧 | `optoelectronics-north` | `0400000000013707` | `FFFF000102075629` | `100664` | mini |
| 硕博A区1号机 | `graduate-a-1` | `0400000000024628` | `FFFF000102124219` | `100664` | mini |
| 硕博A区2号机 | `graduate-a-2` | `0400000000025045` | `FFFF000102123308` | `100664` | mini |
| 硕博A区3号机 | `graduate-a-3` | `0400000000025428` | `FFFF000102124018` | `100664` | mini |
| 硕博B区1号机 | `graduate-b-1` | `0400000000025075` | `FFFF000102122177` | `100664` | mini |
| 硕博B区2号机 | `graduate-b-2` | `0400000000025465` | `FFFF000102124007` | `100664` | mini |
| 硕博B区3号机 | `graduate-b-3` | `0400000000024471` | `FFFF000102124035` | `100664` | mini |
| 硕博C区1号机 | `graduate-c-1` | `0400000000025155` | `FFFF000102122175` | `100664` | mini |
| 硕博C区2号机 | `graduate-c-2` | `0400000000024474` | `FFFF000102123357` | `100664` | mini |
| 硕博C区3号机 | `graduate-c-3` | `0400000000024608` | `FFFF000102124023` | `100664` | mini |
| 硕博D区1号机 | `graduate-d-1` | `0400000000022554` | `FFFF000102115796` | `100664` | mini |
| 硕博D区2号机 | `graduate-d-2` | `0400000000024642` | `FFFF000102123353` | `100664` | mini |
| 硕博D区3号机 | `graduate-d-3` | `0400000000024754` | `FFFF000102122197` | `100664` | mini |
| 硕博二西北侧1号机 | `graduate-two-northwest-1` | `0400000000001532` | `FFFF000102066589` | `100664` | mini |
| 硕博二西北侧2号机 | `graduate-two-northwest-2` | `0400000000011639` | `FFFF000102108484` | `100664` | mini |
| 新1学生公寓 | `new-building-1` | `0400000000013573` | `FFFF000102099537` | `100664` | mini |

mini 设备查询：

```text
POST https://mini.99cda.com/cda-mini-program/chargingBike.do
```

依赖短期 `authorization`、`openId`、当前时间戳、`operatorId` 和 `GID`。

legacy 设备查询：

```text
GET http://wx.99cda.com/cda-wx/chargingBike.do
```

依赖旧 HAR 中的 Session Cookie 与 openId。HAR 位于 `captures/`，可能包含敏感信息，禁止把内容复制到文档、提交信息或公开聊天。

## 5. 云端凭证与 Supabase

Supabase 免费版足够当前单用户、低频使用。`supabase.sql` 创建：

- `charging_credentials`：固定 `id=1`，保存 AES-256-GCM 加密后的凭证。
- `credential_refresh`：固定 `id=1`，保存唯一刷新任务，状态为 `idle/requested/working/completed/failed`。

RLS 已开启，并撤销 `anon`、`authenticated` 权限。Netlify 使用 Secret Key 访问。服务端环境变量：

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`（或兼容的 `SUPABASE_SERVICE_ROLE_KEY`）
- `CREDENTIAL_ENCRYPTION_KEY`：32 字节随机值的 Base64
- `CREDENTIAL_AGENT_KEY`：Netlify 与本机相同的长随机字符串

这些真实值不得提交。浏览器也不能拿到 Secret Key、加密密钥或代理密钥。

## 6. 网页按需更新凭证的完整流程

1. 浏览器调用 `POST /api/status`。
2. Netlify 读取 Supabase 中的加密凭证并查询 27 台设备。
3. 若凭证有效，直接返回状态，前端显示 `当前凭证有效`。
4. 若 mini 凭证失效，`requestRefresh()` 把单行任务写为 `requested`，来源包含本次网页 `queryId`。
5. 本机隐藏计划任务在最多约 15 秒内调用 `/api/agent/poll`；该接口把任务标记为 `working`。
6. Windows 代理执行 Reqable/微信捕获流程（见下一节）。
7. 代理把完整授权响应提交到 `/api/agent/credentials`。
8. Netlify 先用新凭证查询所有设备；确认有效后加密写入 Supabase，并把任务标记为 `completed`。
9. 浏览器持续轮询 `/api/status`，拿到新结果后原位更新 27 张卡片。

去重规则：Supabase 只有一行刷新任务；`requested` 或 `working` 时不会创建第二项。同一失败来源会返回该失败，用户再次点击产生新 `queryId` 后可立即重试，没有五分钟冷却。

云端超时：

- `requested` 超过 75 秒仍未领取：标记“查询电脑未执行代理任务”。
- `working` 超过 90 秒仍未完成：标记“电脑代理执行超时”。
- 错误文案显示在标题下方，要求用户检查对应故障点后重试。

## 7. Windows 代理与 Reqable 生命周期

核心文件：`agent/windows-agent.js`。

单次任务顺序：

1. 记录 Reqable 在任务开始前是否运行；若未运行，同时保存原 Windows 系统代理（例如 Clash 的 `127.0.0.1:7890` 和开关状态）。
2. 只结束 `Reqable.exe`，通过 `explorer.exe` 重新打开 Reqable，使启动环境接近用户双击启动。
3. 等待 `127.0.0.1:9000` 开始监听。
4. 显式把 Windows 系统代理设为 `127.0.0.1:9000`，并通知 WinInet 配置变化。
5. 先用 `LEGACY_OPEN_URL` 在微信建立旧页面授权上下文，再从 `/api/agent/open` 获取 `weixin://` scheme 打开车充安小程序。
6. 从 `CREDENTIAL_CAPTURE_FILE` 和 Reqable 捕获目录中寻找任务开始后生成、大小不超过 16KB、`code=00` 且包含 `authorization/openId` 的响应。
7. 每轮最多等待 20 秒；默认最多 2 轮。第一轮未捕获会立即再次打开车充安，不重启 Reqable。
8. 捕获后上传并让云端验证。
9. 不结束 `Weixin.exe`，也不结束 `WeChatAppEx`。曾验证过结束 `WeChatAppEx` 会连带退出主微信，禁止恢复该行为。
10. 上传验证、Reqable 生命周期处理和代理恢复全部结束后，最后枚举 `Weixin`、`WeChat`、`WeChatAppEx` 的可见顶层窗口，并通过 `ShowWindowAsync(..., SW_MINIMIZE)` 全部最小化到任务栏；不发送快捷键、不抢焦点、不退出微信。该动作位于最外层 `finally`，最小化失败只记录警告，不把凭证任务改判为失败。
11. 如果任务开始前 Reqable 已运行：任务结束后保持 Reqable 和代理运行。
12. 如果任务开始前 Reqable 未运行：任务结束后关闭 Reqable，并恢复任务前保存的 Windows/Clash 代理状态，避免系统代理指向已关闭的 9000 端口。

`CHARGING_CLOSE_COMMAND` 默认留空。新版微信小程序没有可靠、独立且安全的进程/窗口句柄，因此当前无法保证“只关闭车充安而绝不影响主微信”，改为安全地最小化所有微信相关窗口。不要用 `taskkill Weixin.exe` 或 `taskkill WeChatAppEx.exe`。

## 8. 本机配置与计划任务

真实本机配置在被 Git 忽略的 `agent/agent.env`。模板见 `agent/agent.env.example`。当前主要参数：

- `SITE_URL=https://campustest222.netlify.app`
- `REQABLE_PATH`、`WECHAT_PATH`
- `LEGACY_OPEN_URL`
- `MAX_OPEN_ATTEMPTS=2`
- `CAPTURE_ATTEMPT_TIMEOUT_MS=20000`
- `REOPEN_DELAY_MS=0`

不要把 `agent.env` 加入 Git。

隐藏启动链：

```text
Windows 计划任务
  -> wscript.exe agent/run-hidden.vbs --once
  -> agent/run-agent.cmd
  -> node agent/windows-agent.js --once
```

VBS 以隐藏窗口运行并等待 Node 结束，不会弹命令行；代理不结束 `cmd.exe`、PowerShell、Windows Terminal 或用户现有终端。

当前本机有两个计划任务：

### CampusGuide Credential Agent

- 登录时触发一次。
- 每分钟有 4 个错开的触发器：第 `00/15/30/45` 秒，即约每 15 秒检查一次。
- 参数：`--once`。
- 没有任务时立即退出，不常驻 Node。
- `MultipleInstances=IgnoreNew`，防止重叠执行。

### CampusGuide Credential Weekly Refresh

- 每周三、周日 00:00。
- 参数：`--scheduled-once`，先主动创建任务再执行。
- 周计划任务是本机 Task Scheduler 配置，不由 Git 推送自动创建。

注意：`agent/run-agent.cmd` 当前写死了此电脑的 Node 路径 `D:\Softwares\2_Research\nodejs\node.exe`。更换电脑或 Node 位置时必须修改该文件并重建计划任务。

## 9. API 路由

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/status` | 查询全部设备；必要时创建/查询刷新任务 |
| POST | `/api/credentials` | 手动解析并验证凭证 |
| POST | `/api/open` | 生成指定设备跳转链接 |
| GET | `/api/health` 或 `/health` | 云配置和构建版本检查 |
| POST | `/api/agent/poll` | 本机领取任务，需要代理密钥 |
| POST | `/api/agent/request` | 强制创建计划刷新任务，需要代理密钥 |
| POST | `/api/agent/open` | 获取车充安 scheme，需要代理密钥 |
| POST | `/api/agent/credentials` | 验证、保存新凭证，需要代理密钥 |
| POST | `/api/agent/fail` | 本机上报失败，需要代理密钥 |

不要用 `/api/agent/poll` 做只读诊断，因为它会把 `requested` 改成 `working`，相当于领取任务。

## 10. 本地开发、测试与上线验证

本地启动：

```powershell
cd 'E:\codex临时\充电桩页面集成'
npm start
```

提交前至少运行：

```powershell
npm test
npm run check
git diff --check
```

页面内联脚本语法可额外检查：

```powershell
node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('public/index.html','utf8');const a=h.indexOf('<script>')+8,b=h.lastIndexOf('</script>');new vm.Script(h.slice(a,b));console.log('inline script syntax ok')"
```

前端修改至少检查：

- 默认仍打开外卖标签。
- 第一次进入充电页立即看到 27 张等待卡片，且可点击。
- 手机两列布局无横向溢出。
- 查询时旧卡片不消失。
- 错误在更新时间下方换行显示，不出现在按钮左边。
- 成功、失败、凭证自动刷新和长按隐藏入口。

代理修改至少检查：

- Reqable 原本开启：任务前重启，结束后保持开启。
- Reqable 原本关闭：任务临时开启，结束后关闭并恢复 Clash/原系统代理。
- 微信主程序一直保持登录且不退出。
- 无任务的 15 秒检查不重启 Reqable。
- 计划任务最终回到 `Ready`，返回码 `0x00000000`。

推送后验证：

1. 等待 `/api/health` 的 `build` 变成新版本。
2. 请求线上 HTML，确认目标标记已出现，避免只确认 GitHub。
3. 不要为了测试强制创建多个凭证刷新任务；强制 `/api/agent/request` 会在凭证仍有效时额外打开车充安。

## 11. 安全与已知限制

- 不提交 `.env`、`agent/agent.env`、真实授权响应、Supabase Secret Key、加密密钥或代理密钥。
- HAR 可能已有敏感会话；仓库应保持私有，凭证失效后应考虑清理历史 HAR。
- Windows 只有一个系统代理入口。Clash 和 Reqable 会争用同一注册表设置；本项目只在真正执行任务时强制 Reqable，并在 Reqable 原本关闭时恢复原状态。
- 若 Reqable 原本开启，完成后按用户要求保留 Reqable 代理；之后 Clash 可能再次写回自己的代理，这是外部程序行为。
- 网页无法直接唤醒 NAT 后的电脑；当前通过 Supabase 单行任务 + 本机约 15 秒轮询解决。
- Netlify Functions 是无状态实例，不能依赖函数内存长期保存凭证。
- Supabase 免费版休眠、网络波动、Windows 锁屏/休眠、微信未登录均可能导致自动刷新失败。

## 12. 新对话建议开场

```text
请继续修改 E:\codex临时\充电桩页面集成 中的 CampusGuide 项目。
先完整阅读 HANDOFF.md，再检查 git status、最近提交、计划任务状态和线上 /api/health。
不要结束微信主程序或 WeChatAppEx，不要提交任何密钥或真实凭证。
除非我明确要求推送，否则先本地修改和测试，避免消耗 Netlify 部署次数。
本轮需求：<填写需求>。
```
