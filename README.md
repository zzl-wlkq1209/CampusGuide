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
