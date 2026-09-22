# SteamPorter

一个只在你的电脑上运行的 Steam 库管家：把游戏库、真实游玩、成就、截图和云存档放进同一个轻快的界面。

## 核心特点

- 库价值、总时长、游戏数量、成就数一眼可见
- 「全部 / 曾经游玩」筛选；后者会排除零时长、无成就和同秒批量解锁成就的游戏
- 从 Steam 本地缓存解析时长、成就时间、截图与云存档；没有把账号密码交给 SteamPorter 的步骤
- 截图浏览、下载 ZIP；存档按游戏备份为 ZIP
- 挂机检测和「库纯净度」评分，可生成分享卡
- 封面和成就图标来自 Steam 官方 CDN；价格为仓库内置的公开人民币价格快照

## 安全设计

SteamPorter 是纯静态网站，没有后端、数据库、账号系统或遥测。

- **不收集 Steam 密码。** 登录采用 Steam 官方 OpenID 页面；Steam App 扫码和确认只发生在 `steamcommunity.com`。
- **本地数据不会上传。** Steam 文件夹只由浏览器本地读取，文件解析、截图打包、存档备份都在本机完成。
- **没有可泄露的用户库。** GitHub Pages 只托管前端代码和公开价格快照，不保存任何用户 Steam 数据。
- **最小化网络。** 除 Steam 官方 CDN 的封面/成就图标外，功能不依赖第三方 API。

浏览器首次选择 Steam 安装目录时需要授权读取。Chrome/Edge 会保存目录句柄；关闭网页或重启电脑后可继续使用，直到手动退出或清除网站数据。

## 使用

1. 用 Windows Chrome 或 Edge 打开网站。
2. 点击「连接 Steam」，选择 Steam 安装目录（通常为 `C:\Program Files (x86)\Steam`）。
3. 选择本机账号。可选点击 Steam 官方登录页中的二维码，以 Steam App 完成扫码确认。
4. 等待本地扫描完成。

> 仅支持 Chromium 浏览器的 File System Access API；这是为了在网页中安全读取用户主动授权的本地 Steam 文件。

## 本地开发

项目没有 npm 依赖。可用任意静态服务器打开根目录，例如：

```powershell
cd C:\Users\24142\Desktop\steam
.\tests\server.ps1 -Port 8000
```

然后访问 `http://localhost:8000`。

## 价格快照

`data/prices.json` 是公开 Steam 商店人民币价格快照。更新方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\gen-prices.ps1 -MaxApps 100
```

Steam 商店公开接口一次只接受一个 appid；脚本有节流和重试。未收录游戏不会计入估算价值。

## 已知边界

- Steam 本地 `localconfig.vdf` 只能列出当前客户端已同步的库条目。对于未被本机客户端同步的游戏，SteamPorter 无法凭空取得它。
- iPhone/Android 一键传图属于下一版；首版提供标准 ZIP 下载，手机浏览器可直接保存。
- 价格是现价快照，不代表购买历史或账户真实消费金额。

## 开源许可

MIT
