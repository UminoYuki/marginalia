# Marginalia · 书斋 —— 微信读书摘抄馆

把 Obsidian 库里的微信读书笔记（weread2obsidian 导出格式）变成一个可自定义版式与主题的本地摘抄展示站。

## 截图

**书架**：按分类浏览全部藏书，封面本地缓存

![书架](docs/screenshots/shelf.jpg)

**书籍详情**：按章节展示划线，每条都能一键制卡或复制

![书籍详情](docs/screenshots/book-detail.jpg)

**摘抄制卡**：6 种卡片样式实时预览，导出 1800×2400 高清 PNG

![摘抄制卡](docs/screenshots/card-maker.jpg)

**每日一签**：每天随机抽一句摘抄

![每日一签](docs/screenshots/daily.jpg)

## 运行

- 双击 `start.bat`，或在本目录执行 `node server.js`
- 浏览器自动打开 <http://127.0.0.1:8787>
- 亦可在工作区根目录 `D:\Antigravity-project` 下直接双击 `start-marginalia.bat` 或通过 `start-web-launcher.bat` 菜单拉起
- 临时换端口：设置环境变量 `MARGINALIA_PORT`（如 PowerShell 中 `$env:MARGINALIA_PORT=8799; node server.js`），不会改动 `config.json`
- 依赖：仅 Node.js（≥18，本机 v22 可用）。**零 npm 依赖**，不需要 `npm install`。

## 数据源

- 在页面右上角 **设置 → 数据源** 中管理：
  - 列表显示每个目录的状态（识别到多少本微信读书笔记，或「目录不存在」等错误）；
  - 点 ✕ 移除目录；在输入框粘贴文件夹**绝对路径**后点「检查」（或回车），确认存在并显示其中的书籍数量后加入列表；
  - 点「保存并重新载入」写入 `config.json` 并立即刷新书库，**无需重启服务**；「撤销」放弃未保存的改动。
  - 至少需要保留一个目录；不存在、不是文件夹或不可读的路径会被拒绝。
- 仍可手动编辑 `config.json` → `sourceDirs`（路径数组，Windows 下反斜杠写成 `\\`）。服务会在下次请求时检测到文件变化并自动重新加载，同样无需重启。
- 解析器会自动跳过不含 `doc_type: weread-highlights-reviews` 的文件，所以指向整个 Obsidian 库也没问题（只是扫描稍慢）。

## 数据与安全约定

- **对 Obsidian 库只读**：代码中只调用 `readFile / readdir / stat`，不存在任何指向库目录的写路径；不会在库中修改或新增任何文件。修改数据源只会写本项目的 `config.json`（先写临时文件再重命名，保留其他配置项）。
- 所有本项目产生的数据（封面缓存 `data/covers/`、设置 `data/settings.json`、日志）都落在本项目目录（D 盘）内，不占用 C 盘。
- 服务只监听 `127.0.0.1`；端口/绑定地址在 `config.json` 里改。

> 笔记文件需要满足什么格式、哪些字段是必须的，见 [数据源格式说明](docs/data-format.md)。

## 功能

- 5 种书斋版式：书架 / 摘抄卡片（瀑布流）/ 阅读时间轴 / 书卷长读 / 每日一签
- 6 套主题：宣纸、墨韵、青瓷、夜航、咖啡、极简
- 自定义：字体（宋 / 楷 / 黑）、字号、行距、版心宽度、强调色、封面与章节日期等显示开关
- 数据源管理：在设置面板中增删笔记目录，保存即生效
- 摘抄制卡：任意一条摘抄可打开「制卡器」，6 种分享卡片样式（宣纸 / 墨笺 / 竖笺 / 便签 / 素卡 / 夜读）实时预览；字号可在 80%–150% 间调节（A± / 滑杆 / 重置），内置离屏溢出探针自动适配长文防止破版；可开关作者 / 章节 / 日期，一键**导出 1800×2400 高清 PNG** 或复制图片到剪贴板（卡片 / 时间轴 / 书籍详情 / 每日一签四处均可进入）
- 搜索、分类筛选、按书浏览、划线一键复制、书评展示、封面本地缓存（离线可用）

## 结构

```
marginalia/
├─ server.js          # 零依赖 HTTP 服务（API + 静态页 + 封面代理）
├─ config.example.json # 配置模板（首次运行自动复制为 config.json）
├─ docs/data-format.md # 数据源笔记格式说明
├─ config.json        # 本地数据源与端口配置（不入库）
├─ lib/parser.js      # weread 笔记解析（frontmatter + 章节 + 划线 + 书评）
├─ lib/library.js     # 只读书库扫描、目录检查与 mtime 缓存
├─ public/            # 前端（原生 HTML/CSS/JS，无构建步骤）
└─ data/              # 运行时生成：settings.json、covers/
```

### API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/books` | 全部书籍与摘抄 |
| GET / POST | `/api/settings` | 读取 / 保存界面设置（`data/settings.json`） |
| GET | `/api/sources` | 当前数据源列表，每项含 `path / exists / isDirectory / readable / count / error` |
| POST | `/api/sources` | 保存数据源，body：`{"sourceDirs": ["D:\\..."]}`；校验失败返回 400 与中文错误 |
| POST | `/api/sources/check` | 检查单个目录，body：`{"path": "D:\\..."}`，返回同上结构 |
| GET | `/api/cover?id=` | 封面代理（缓存到 `data/covers/`） |
| GET | `/api/ping` | 健康检查 |
