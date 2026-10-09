# 北理校园直达：项目交接说明

> 本文用于在新的 Codex 对话中继续修改本项目。建议新对话首先阅读本文，再检查当前 Git 状态。

## 1. 项目位置与线上地址

- 本地目录：`E:\codex临时\充电桩页面集成`
- GitHub：`https://github.com/zzl-wlkq1209/CampusGuide.git`
- 默认分支：`main`
- Netlify：`https://bit-campusguide.netlify.app/`
- 本地预览：`http://127.0.0.1:4173/`
- 启动命令：`npm start`
- Node.js 要求：18 或更高版本

Netlify 与 GitHub 的 `main` 分支关联。通常提交并推送后会自动部署，无须手动上传。

## 2. 项目结构

```text
充电桩页面集成/
├─ public/
│  ├─ index.html              # 页面、样式和浏览器端脚本均在此文件
│  └─ qrcodes/                # 外卖柜、餐饮二维码图片
├─ captures/                  # 充电服务抓包 HAR（包含敏感会话信息）
├─ netlify/functions/api.js   # Netlify Functions 入口
├─ server.js                  # 本地服务器、充电查询和跳转逻辑
├─ netlify.toml               # Netlify 发布、函数和路由配置
├─ package.json
├─ README.md
└─ HANDOFF.md                 # 本文
```

这是一个轻量项目，没有前端框架和构建步骤。`public/index.html` 是单页应用；本地由 `server.js` 提供静态文件和 API，线上 API 由 Netlify Function 调用同一份服务逻辑。

## 3. 页面现状

页面包含四个顶栏标签，默认打开“外卖”：

1. 外卖：4 个外卖柜二维码，两列排列，仅供扫码，不尝试直接打开。
2. 快递：粘贴近邻宝短信后识别取件信息，并打开相应柜机。
3. 充电：查询多个充电桩的实时空闲通道数，并可点击设备卡片跳转充电。
4. 餐饮：肯德旺可点击直达；好这口显示二维码扫码点餐。

顶栏保持在页面上方，使用透明玻璃质感。

## 4. 快递功能当前行为

主要代码位于 `public/index.html` 中的 `parseParcel()`、`copyCode()` 和 `#open-cabinet` 点击事件附近。

- 支持识别 `1481-3374` 和 `14813374` 两种八位取件码格式。
- 支持识别 `1号柜` 至 `6号柜`。
- 支持识别类似 `A18` 的柜门号。
- 识别结果格式：`取件码 14813374 · 4号柜 · A18`。
- “取件”按钮位于识别结果同行右侧，约为 `57 × 34px`。
- 点击“取件”会尽力把纯数字取件码写入剪贴板，然后跳转对应柜机链接。
- 不显示“已复制”提示。
- 点击后会清空短信输入框、清空识别状态、禁用按钮，并恢复“等待粘贴短信”。
- 已移除网页主动读取剪贴板功能，因为微信内置浏览器会禁止该权限。

柜机链接在 `public/index.html` 的 `cabinetUrls` 数组中，数组下标依次对应 1—6 号柜。

## 5. 充电功能

### 5.1 交互行为

- 第一次切换到“充电”标签时才自动查询，页面初始加载不会查询。
- 用户可以手动点击“重新查询”。
- 每张设备卡显示 `空闲数/总通道数`，空闲数大于 0 时用绿色，0 时用红色。
- 整张设备卡可以点击跳转，不另设“打开充电页”按钮。
- 滑动页面时不会误触点击动画；正常点按会显示圆角卡片动效。
- 凭证失效的卡片仍然允许点击，尝试进入对应页面。
- 凭证失效时自动展开“更新凭证”输入框。
- 更新凭证后，设备进入加载状态；确认新结果返回后才收起凭证框。

### 5.2 设备清单

设备定义位于 `server.js` 的 `DEVICES` 数组，当前顺序如下：

| 名称 | q | GID | operatorId | 模式 |
|---|---|---|---|---|
| 13号楼1号机 | `0400000000022269` | `FFFF000102116079` | `100664` | mini |
| 13号楼2号机 | `0400000000022818` | `FFFF000102115980` | `100664` | mini |
| 7号楼1号机 | `0400000000023982` | `FFFF000102120435` | `100664` | mini |
| 7号楼2号机 | `0400000000027455` | `FFFF000102133318` | `100664` | mini |
| 12号楼1号机 | `0400000000021978` | `FFFF000102115982` | `100664` | mini |
| 12号楼2号机 | `0400000000022277` | `FFFF000102116731` | `100664` | mini |
| 11号楼1号机 | `0400000000022229` | `FFFF000102116794` | `100664` | mini |
| 11号楼2号机 | `0400000000022314` | `FFFF000102116140` | `100664` | mini |
| 国防科技园1号机 | `0400000000022530` | `FFFF000102117180` | `103745` | legacy |
| 国防科技园2号机 | `0400000000022753` | `FFFF000102111097` | `103745` | legacy |
| 新1学生公寓 | `0400000000013573` | `FFFF000102099537` | `100664` | mini |

### 5.3 两套查询方式

普通设备使用小程序接口：

```text
POST https://mini.99cda.com/cda-mini-program/chargingBike.do
```

请求依赖：

- `authorization` 请求头
- `openId`
- 当前毫秒时间戳
- 设备的 `operatorId`
- 设备的 `GID`

国防科技园两台设备仍走旧网页接口：

```text
GET http://wx.99cda.com/cda-wx/chargingBike.do
```

旧接口依赖 HAR 内的 Session Cookie 和 openId。默认文件为：

```text
captures/wx.99cda.com_2026_10_09_01_01_44.har
```

普通小程序默认 HAR 为：

```text
captures/mini.99cda.com_2026_10_09_01_31_25.har
```

注意：HAR 可能包含登录态、Cookie、openId 等敏感信息，不要公开分享或提交到公开位置。当前仓库已包含这些文件时，应优先考虑把仓库设为私有，并在凭证过期后替换或清理旧文件。

## 6. 凭证更新流程

长期有效的静态认证目前没有找到。普通设备的 `authorization` 会过期，因此页面提供手动更新。

操作流程：

1. 在微信小程序中打开“车充安”。
2. 用 Reqable 捕获 `userAuthorization.do` 的响应。
3. 复制完整响应内容；可以包含 HTTP 响应头和 JSON，不必手工截取。
4. 在网站“充电”页点击“更新凭证”。
5. 粘贴全部内容并点击“更新并查询”。

可识别的核心 JSON 格式：

```json
{
  "msg": "获取成功",
  "code": "00",
  "data": {
    "authorization": "此处为临时凭证",
    "openId": "此处为微信用户标识"
  }
}
```

不要把真实凭证写入本文、README、截图或提交说明。

浏览器端把用户粘贴的完整文本保存到 `sessionStorage`：

```text
bit-charging-credential-response
```

因此：

- 同一标签页刷新后仍可继续使用。
- 关闭标签页或浏览器后可能需要重新粘贴。
- 凭证不会写入 Git 仓库。
- Netlify Function 的内存变量不可靠，因为无服务器实例可能随时重建；真正连续查询主要依靠前端每次请求携带 `credentialText`。

解析逻辑位于 `server.js` 的 `credentialsFromPayload()`。它可以从纯 JSON、HTTP 头加 JSON、或包含字段的长文本中提取 `authorization` 和 `openId`。

## 7. API 路由

本地和线上保持相同的前端路由：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/status` | 查询全部充电桩状态 |
| POST | `/api/credentials` | 解析、验证新凭证 |
| POST | `/api/open` | 生成设备的小程序跳转链接 |
| GET | `/health` | 健康检查 |

线上由 `netlify.toml` 将 `/api/*` 重写到 `netlify/functions/api.js`。

## 8. 微信和浏览器限制

- 微信内置浏览器禁止普通网页主动读取剪贴板，所以不要重新加入“自动粘贴”按钮，除非接受用户手动授权失败的情况。
- 页面仍需要 `clipboard-write`，因为“取件”按钮会复制取件码；权限声明位于 `netlify.toml`。
- 网页不能模拟微信扫码动作。二维码只能展示给用户长按识别或由另一设备扫描。
- 部分微信、小程序或第三方点餐链接不能作为普通浏览器 URL 稳定打开，因此当前外卖柜和“好这口”以二维码为主。
- 普通 HTTP 的 `wx.99cda.com` 在 HTTPS 网站前端直接请求会遇到混合内容和跨域问题，因此充电查询必须经过后端代理。

## 9. 本地开发与验证

启动：

```powershell
cd 'E:\codex临时\充电桩页面集成'
npm start
```

默认地址：`http://127.0.0.1:4173/`

修改 `public/index.html` 后通常只需刷新浏览器。提交前建议运行：

```powershell
npx prettier@3.6.2 --write public/index.html
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');new Function(h.split('<script>')[1].split('</script>')[0]);console.log('inline script syntax ok')"
python -c "import tomllib; tomllib.load(open('netlify.toml','rb')); print('netlify.toml ok')"
git diff --check
```

若修改充电功能，至少验证：

- 默认仍打开“外卖”。
- 切换到“充电”才首次发起查询。
- 凭证有效、失效、更新中三种状态。
- 手机宽度下充电卡片保持紧凑且无横向溢出。
- 点击卡片的跳转和返回后再次点击。

若修改快递功能，使用此测试短信：

```text
【近邻宝】凭「1481-3374」到北理工快递驿站4号柜A18取件。
```

预期识别结果：

```text
取件码 14813374 · 4号柜 · A18
```

## 10. 提交和部署

```powershell
git status --short
git add <修改的文件>
git commit -m "简洁明确的英文提交说明"
git push origin HEAD
```

推送后等待 Netlify 自动部署，再访问线上地址确认新 HTML 已生效。不要把抓包得到的新认证字段直接写进提交信息。

## 11. 当前 Git 状态

制作本文前，功能代码最新提交为：

```text
d29a025 Reset parcel form after pickup
91305e1 Make parcel pickup button compact
55a7672 Simplify parcel pickup action
5dfaabe Show parcel locker door number
```

本文本身创建后会产生新的未提交文件，是否提交由后续操作决定。

## 12. 给新对话的建议开场提示

可以把下面这段直接发给新的 Codex 对话：

```text
请继续修改 E:\codex临时\充电桩页面集成 中的北理校园直达项目。
先完整阅读 HANDOFF.md，再检查 git status、最近提交和当前页面。
保留已有功能和视觉风格；修改后在本地验证手机布局，提交到 main 并确认 Netlify 自动部署成功。
本轮我要修改的是：<在这里写新的需求>。
```
